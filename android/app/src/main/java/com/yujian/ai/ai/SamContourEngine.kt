package com.yujian.ai.ai

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OnnxValue
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.security.MessageDigest
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * SAM 鱼体轮廓分割引擎（demo AI--main samService + contourExtraction 的 Android 移植）。
 *
 * 模型：demo 同款 `Xenova/slimsam-77-uniform` q8 量化 ONNX 导出（transformers.js 用的
 * 那两个文件），由 ONNX Runtime 在端上运行：
 *  - vision_encoder：pixel_values[1,3,1024,1024] → image_embeddings[1,256,64,64]
 *    + image_positional_embeddings[1,256,64,64]；
 *  - prompt_encoder_mask_decoder：input_points[1,1,N,2] float32（1024 输入帧坐标）
 *    + input_labels[1,1,N] int64（1 正 / 0 负）+ 两个嵌入 → iou_scores[1,1,3]
 *    + pred_masks[1,1,3,256,256]（logits，>0 即前景；此导出无 mask_input 迭代输入）。
 *
 * 预处理与 HF SamProcessor 一致：最长边缩到 1024（双线性）、/255、ImageNet 均值方差
 * 归一化、右/下零填充到 1024²；提示点按同一缩放比映射到 1024 帧。
 *
 * 流程与 demo 逐步对应：
 *  1. 由检测框推导点提示（竖向鱼 7 正 + 1 负点排除鱼唇上方手/夹鱼器；横向鱼 7 正点）；
 *  2. 三个候选掩码各做：框外 45% 余量裁剪 → 最大连通域（BFS）→ 可信度门禁
 *     （覆盖比 0.18–0.85、主轴跨度 ≥ 0.48、IoU ≥ 0.60）→ 综合评分
 *     （IoU 0.4 + 覆盖 0.3 + 跨度 0.3）选最佳；
 *  3. Moore 邻域边界追踪 → 循环加权平滑 ×3 → RDP 简化 → 二次平滑 ×2，
 *     输出归一化闭合轮廓点（≤ MAX_POINTS）。
 * 掩码处理在 1024 输入帧分辨率完成（≤ 1M 像素），归一化后与原图坐标系等价。
 */
class SamContourEngine(private val context: Context) : AutoCloseable {

    /** 归一化轮廓点（0..1，相对 EXIF 归一后的原图） */
    data class ContourPoint(val x: Float, val y: Float)

    data class ContourResult(
        /** 有序闭合轮廓（首尾不重复） */
        val points: List<ContourPoint>,
        val iouScore: Float,
        val pixelCount: Int,
        val maskBox: NormalizedFishBox,
        /** 是否通过 demo 的掩码可信度门禁（不可信时调用方退回 bbox 模式） */
        val trustworthy: Boolean,
        val encoderLatencyMs: Long,
        val decoderLatencyMs: Long,
        val totalLatencyMs: Long,
    )

    private class Pt(val x: Float, val y: Float)

    private class Prompt(val x: Float, val y: Float, val label: Int)

    private class Candidate(
        val index: Int,
        val iou: Float,
        val cleanMask: ByteArray,
        val pixelCount: Int,
        val minX: Int,
        val minY: Int,
        val maxX: Int,
        val maxY: Int,
        val startX: Int,
        val startY: Int,
        val trustworthy: Boolean,
        val score: Float,
    )

    private class Component(
        val cleanMask: ByteArray,
        val pixelCount: Int,
        val minX: Int,
        val minY: Int,
        val maxX: Int,
        val maxY: Int,
        val startX: Int,
        val startY: Int,
    )

    private val environment: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val runMutex = Mutex()

    private val encoderLazy = lazy {
        openSession(ENCODER_FILE, ENCODER_SHA256, ENCODER_BYTES).also { session ->
            require(session.inputNames.contains(IN_PIXEL_VALUES)) { "SAM encoder 缺少输入 $IN_PIXEL_VALUES" }
            require(session.outputNames.contains(OUT_EMBEDDINGS) && session.outputNames.contains(OUT_POS_EMBEDDINGS)) {
                "SAM encoder 输出名不匹配：${session.outputNames}"
            }
        }
    }
    private val decoderLazy = lazy {
        openSession(DECODER_FILE, DECODER_SHA256, DECODER_BYTES).also { session ->
            val inputs = session.inputNames
            require(
                inputs.containsAll(listOf(IN_POINTS, IN_LABELS, OUT_EMBEDDINGS, OUT_POS_EMBEDDINGS)),
            ) { "SAM decoder 输入名不匹配：$inputs" }
            require(session.outputNames.contains(OUT_IOU) && session.outputNames.contains(OUT_MASKS)) {
                "SAM decoder 输出名不匹配：${session.outputNames}"
            }
        }
    }

    /** 预加载两个会话（校验 SHA256 + 建图），首个 extractContour 不再承担加载耗时。 */
    fun warmup() {
        encoderLazy.value
        decoderLazy.value
    }

    /**
     * 对 [bitmap] 以 [promptBox]（归一化检测框）为提示做分割并提取轮廓。
     * 返回 null 表示没有可用轮廓（掩码为空 / 过小）；trustworthy=false 表示有轮廓但未过门禁。
     */
    suspend fun extractContour(bitmap: Bitmap, promptBox: NormalizedFishBox): ContourResult? =
        withContext(Dispatchers.Default) {
            runMutex.withLock { extractLocked(bitmap, promptBox) }
        }

    private fun extractLocked(bitmap: Bitmap, promptBox: NormalizedFishBox): ContourResult? {
        val started = System.nanoTime()
        val width = bitmap.width
        val height = bitmap.height
        require(width > 0 && height > 0) { "SAM 输入图片尺寸无效" }
        val box = promptBox.normalized()
        if (box.width <= 0f || box.height <= 0f) return null

        // 1. 预处理：最长边 → 1024，右/下零填充
        val longest = max(width, height)
        val scale = INPUT_SIZE.toFloat() / longest
        val rw = (width * scale).roundToInt().coerceIn(1, INPUT_SIZE)
        val rh = (height * scale).roundToInt().coerceIn(1, INPUT_SIZE)
        val pixelValues = preparePixelValues(bitmap, rw, rh)

        // 2. 图像编码
        val encoderStarted = System.nanoTime()
        val (embeddings, posEmbeddings) = runEncoder(pixelValues)
        val encoderLatencyMs = (System.nanoTime() - encoderStarted) / 1_000_000

        // 3. 点提示（原图像素坐标，喂图前按 scale 映射到 1024 帧）
        val prompts = buildPointPrompts(box, width, height)

        // 4. 提示编码 + 掩码解码
        val decoderStarted = System.nanoTime()
        val (iouScores, masks) = runDecoder(embeddings, posEmbeddings, prompts, scale)
        val decoderLatencyMs = (System.nanoTime() - decoderStarted) / 1_000_000

        // 5. 三候选在 rw×rh 工作帧评估（阈值 + 框外余量裁剪 + 最大连通域 + 门禁 + 评分）
        val bx1 = box.x1 * rw
        val by1 = box.y1 * rh
        val bx2 = box.x2 * rw
        val by2 = box.y2 * rh
        val candidates = (0 until MASK_CANDIDATES).mapNotNull { c ->
            evaluateCandidate(masks, c, iouScores.getOrElse(c) { 0.85f }, rw, rh, bx1, by1, bx2, by2)
        }
        val best = candidates.maxByOrNull { it.score } ?: return null
        if (best.pixelCount < MIN_COMPONENT_PIXELS) return null

        // 6. 轮廓：Moore 追踪 → 平滑 ×3 → RDP → 平滑 ×2（demo extractContourFromMask）
        val raw = traceBoundary(best.cleanMask, rw, rh, best.startX, best.startY)
        if (raw.size < 3) return null
        val smoothedRaw = smoothClosed(raw, 3)
        var epsilon = RDP_EPSILON
        var simplified = simplifyRdp(smoothedRaw, epsilon)
        var guard = 0
        while (simplified.size > MAX_POINTS && guard++ < 6) {
            epsilon *= 1.5f
            simplified = simplifyRdp(smoothedRaw, epsilon)
        }
        val finalPoints = smoothClosed(simplified, 2)
        if (finalPoints.size < MIN_CONTOUR_POINTS) return null

        return ContourResult(
            points = finalPoints.map { ContourPoint(it.x / rw, it.y / rh) },
            iouScore = best.iou,
            pixelCount = best.pixelCount,
            maskBox = NormalizedFishBox(
                best.minX / rw.toFloat(),
                best.minY / rh.toFloat(),
                (best.maxX + 1) / rw.toFloat(),
                (best.maxY + 1) / rh.toFloat(),
            ).normalized(),
            trustworthy = best.trustworthy,
            encoderLatencyMs = encoderLatencyMs,
            decoderLatencyMs = decoderLatencyMs,
            totalLatencyMs = (System.nanoTime() - started) / 1_000_000,
        )
    }

    // ------------------------------------------------------------------
    // 预处理 / 推理
    // ------------------------------------------------------------------

    /** HF SamProcessor：resize 最长边 1024 → /255 → ImageNet 归一化 → 右/下填 0（归一化空间） */
    private fun preparePixelValues(bitmap: Bitmap, rw: Int, rh: Int): ByteBuffer {
        val scaled = if (bitmap.width == rw && bitmap.height == rh) bitmap else Bitmap.createScaledBitmap(bitmap, rw, rh, true)
        val pixels = IntArray(rw * rh)
        scaled.getPixels(pixels, 0, rw, 0, 0, rw, rh)
        if (scaled !== bitmap) scaled.recycle()

        val plane = INPUT_SIZE * INPUT_SIZE
        val values = FloatArray(plane * 3)
        for (y in 0 until rh) {
            val srcRow = y * rw
            val dstRow = y * INPUT_SIZE
            for (x in 0 until rw) {
                val p = pixels[srcRow + x]
                val t = dstRow + x
                values[t] = ((p shr 16 and 0xFF) / 255f - MEAN_R) / STD_R
                values[plane + t] = ((p shr 8 and 0xFF) / 255f - MEAN_G) / STD_G
                values[plane * 2 + t] = ((p and 0xFF) / 255f - MEAN_B) / STD_B
            }
        }
        return directFloats(values)
    }

    private fun runEncoder(pixelValues: ByteBuffer): Pair<FloatArray, FloatArray> {
        val shape = longArrayOf(1, 3, INPUT_SIZE.toLong(), INPUT_SIZE.toLong())
        return OnnxTensor.createTensor(environment, pixelValues.asFloatBuffer(), shape).use { input ->
            encoderLazy.value.run(mapOf(IN_PIXEL_VALUES to input)).use { result ->
                val embeddings = floatsOf(result, OUT_EMBEDDINGS, EMBED_FLOATS)
                val positional = floatsOf(result, OUT_POS_EMBEDDINGS, EMBED_FLOATS)
                embeddings to positional
            }
        }
    }

    private fun runDecoder(
        embeddings: FloatArray,
        posEmbeddings: FloatArray,
        prompts: List<Prompt>,
        scale: Float,
    ): Pair<FloatArray, FloatArray> {
        val n = prompts.size
        require(n > 0) { "SAM 提示点为空" }
        val coords = FloatArray(n * 2)
        val labels = LongArray(n)
        prompts.forEachIndexed { i, p ->
            coords[i * 2] = p.x * scale
            coords[i * 2 + 1] = p.y * scale
            labels[i] = p.label.toLong()
        }
        val embedShape = longArrayOf(1, EMBED_CHANNELS.toLong(), EMBED_SIZE.toLong(), EMBED_SIZE.toLong())
        return OnnxTensor.createTensor(environment, directFloats(coords).asFloatBuffer(), longArrayOf(1, 1, n.toLong(), 2)).use { points ->
            OnnxTensor.createTensor(environment, directLongs(labels).asLongBuffer(), longArrayOf(1, 1, n.toLong())).use { labelTensor ->
                OnnxTensor.createTensor(environment, directFloats(embeddings).asFloatBuffer(), embedShape).use { emb ->
                    OnnxTensor.createTensor(environment, directFloats(posEmbeddings).asFloatBuffer(), embedShape).use { pos ->
                        val feeds = mapOf(
                            IN_POINTS to points,
                            IN_LABELS to labelTensor,
                            OUT_EMBEDDINGS to emb,
                            OUT_POS_EMBEDDINGS to pos,
                        )
                        decoderLazy.value.run(feeds).use { result ->
                            val iou = floatsOf(result, OUT_IOU, MASK_CANDIDATES)
                            val masks = floatsOf(result, OUT_MASKS, MASK_CANDIDATES * LOW_RES * LOW_RES)
                            iou to masks
                        }
                    }
                }
            }
        }
    }

    private fun floatsOf(result: OrtSession.Result, name: String, expectedSize: Int): FloatArray {
        val value: OnnxValue = result.get(name).orElseThrow { IllegalStateException("SAM 输出缺失：$name") }
        val tensor = value as? OnnxTensor ?: error("SAM 输出 $name 不是 tensor")
        val buffer: FloatBuffer = tensor.floatBuffer ?: error("SAM 输出 $name 不是 FLOAT tensor")
        val array = FloatArray(buffer.remaining())
        buffer.get(array)
        require(array.size == expectedSize) { "SAM 输出 $name 元素数异常：${array.size}（期望 $expectedSize）" }
        return array
    }

    /**
     * 由检测框推导点提示（demo samService.segment 的 detectionBox 分支逐字）：
     * 竖向鱼（举鱼竖拍）顶部 15–20% 常是手/夹鱼器，正点沿鱼身脊线 28%–88% 分布并在
     * 鱼唇上方放一个负点；横向鱼正点沿水平脊线分布，加背/腹各一点。
     */
    private fun buildPointPrompts(box: NormalizedFishBox, width: Int, height: Int): List<Prompt> {
        val bx1 = box.x1 * width
        val by1 = box.y1 * height
        val bx2 = box.x2 * width
        val by2 = box.y2 * height
        val bw = max(20f, bx2 - bx1)
        val bh = max(20f, by2 - by1)
        val bcx = ((bx1 + bx2) / 2f).roundToInt().toFloat()
        val bcy = ((by1 + by2) / 2f).roundToInt().toFloat()
        val isVertical = bh > bw * 1.15f

        return if (isVertical) {
            listOf(
                Prompt(bcx, (by1 + bh * 0.56f).roundToInt().toFloat(), 1),
                Prompt(bcx, (by1 + bh * 0.28f).roundToInt().toFloat(), 1),
                Prompt(bcx, (by1 + bh * 0.44f).roundToInt().toFloat(), 1),
                Prompt(bcx, (by1 + bh * 0.72f).roundToInt().toFloat(), 1),
                Prompt(bcx, (by1 + bh * 0.88f).roundToInt().toFloat(), 1),
                Prompt(max(bx1 + 8f, (bcx - bw * 0.22f).roundToInt().toFloat()), (by1 + bh * 0.55f).roundToInt().toFloat(), 1),
                Prompt(min(bx2 - 8f, (bcx + bw * 0.22f).roundToInt().toFloat()), (by1 + bh * 0.55f).roundToInt().toFloat(), 1),
                // 鱼唇上方夹鱼器 / 手：负点
                Prompt(bcx, max(0f, (by1 - 10f).roundToInt().toFloat()), 0),
            )
        } else {
            listOf(
                Prompt(bcx, bcy, 1),
                Prompt((bx1 + bw * 0.20f).roundToInt().toFloat(), bcy, 1),
                Prompt((bx1 + bw * 0.38f).roundToInt().toFloat(), bcy, 1),
                Prompt((bx1 + bw * 0.62f).roundToInt().toFloat(), bcy, 1),
                Prompt((bx1 + bw * 0.80f).roundToInt().toFloat(), bcy, 1),
                Prompt(bcx, max(by1 + 5f, (bcy - bh * 0.2f).roundToInt().toFloat()), 1),
                Prompt(bcx, min(by2 - 5f, (bcy + bh * 0.2f).roundToInt().toFloat()), 1),
            )
        }
    }

    // ------------------------------------------------------------------
    // 候选掩码评估（demo samService 后处理）
    // ------------------------------------------------------------------

    private fun evaluateCandidate(
        masks: FloatArray,
        candidate: Int,
        iou: Float,
        rw: Int,
        rh: Int,
        bx1: Float,
        by1: Float,
        bx2: Float,
        by2: Float,
    ): Candidate? {
        // 框外 45% 余量裁剪（长鳍与尾不被切，但远处手/杂物被排除）
        val padX = ((bx2 - bx1) * CROP_GATE_RATIO).roundToInt()
        val padY = ((by2 - by1) * CROP_GATE_RATIO).roundToInt()
        val gateX1 = max(0, bx1.roundToInt() - padX)
        val gateY1 = max(0, by1.roundToInt() - padY)
        val gateX2 = min(rw - 1, bx2.roundToInt() + padX)
        val gateY2 = min(rh - 1, by2.roundToInt() + padY)
        if (gateX2 <= gateX1 || gateY2 <= gateY1) return null

        val binary = ByteArray(rw * rh)
        val offset = candidate * LOW_RES * LOW_RES
        var any = false
        for (y in gateY1..gateY2) {
            val row = y * rw
            for (x in gateX1..gateX2) {
                if (sampleLogit(masks, offset, x, y) > 0f) {
                    binary[row + x] = 1
                    any = true
                }
            }
        }
        if (!any) return null

        val lcc = largestComponent(binary, rw, rh)
        if (lcc.pixelCount <= 0) return null

        val targetW = bx2 - bx1
        val targetH = by2 - by1
        val targetArea = max(1f, targetW * targetH)
        val covRatio = lcc.pixelCount / targetArea
        val spanW = (lcc.maxX - lcc.minX + 1).toFloat()
        val spanH = (lcc.maxY - lcc.minY + 1).toFloat()
        val isVert = targetH > targetW * 1.1f
        val majorSpan = if (isVert) spanH / max(1f, targetH) else spanW / max(1f, targetW)
        val trustworthy = covRatio >= TRUST_COV_MIN && covRatio <= TRUST_COV_MAX &&
            majorSpan >= TRUST_SPAN_MIN && iou >= TRUST_IOU_MIN

        // demo 候选排序：IoU 0.4 + 覆盖 0.3 + 主轴跨度 0.3（偏向完整整鱼而非碎片）
        val covScore = min(lcc.pixelCount / max(1f, targetArea * 0.35f), 1f)
        val spanScore = min(spanH / max(1f, targetH * 0.7f), 1f) * min(spanW / max(1f, targetW * 0.7f), 1f)
        val score = iou * 0.4f + covScore * 0.3f + spanScore * 0.3f

        return Candidate(
            index = candidate,
            iou = iou,
            cleanMask = lcc.cleanMask,
            pixelCount = lcc.pixelCount,
            minX = lcc.minX,
            minY = lcc.minY,
            maxX = lcc.maxX,
            maxY = lcc.maxY,
            startX = lcc.startX,
            startY = lcc.startY,
            trustworthy = trustworthy,
            score = score,
        )
    }

    /** 256×256 低分辩 logits 双线性采样到 1024 输入帧像素 (x, y)（HF post_process_masks 的插值等价） */
    private fun sampleLogit(masks: FloatArray, offset: Int, x: Int, y: Int): Float {
        val lx = ((x + 0.5f) * LOW_RES_PER_INPUT - 0.5f).coerceIn(0f, (LOW_RES - 1).toFloat())
        val ly = ((y + 0.5f) * LOW_RES_PER_INPUT - 0.5f).coerceIn(0f, (LOW_RES - 1).toFloat())
        val x0 = floor(lx).toInt()
        val y0 = floor(ly).toInt()
        val x1 = min(x0 + 1, LOW_RES - 1)
        val y1 = min(y0 + 1, LOW_RES - 1)
        val fx = lx - x0
        val fy = ly - y0
        val top = masks[offset + y0 * LOW_RES + x0] * (1f - fx) + masks[offset + y0 * LOW_RES + x1] * fx
        val bottom = masks[offset + y1 * LOW_RES + x0] * (1f - fx) + masks[offset + y1 * LOW_RES + x1] * fx
        return top * (1f - fy) + bottom * fy
    }

    /** 最大连通域（4 邻域 BFS；demo getLargestConnectedComponent） */
    private fun largestComponent(mask: ByteArray, width: Int, height: Int): Component {
        val total = width * height
        val visited = ByteArray(total)
        val queue = IntArray(total)
        var bestPixels: IntArray? = null
        var bestCount = 0
        var bestMinX = width
        var bestMinY = height
        var bestMaxX = 0
        var bestMaxY = 0
        var bestStartX = -1
        var bestStartY = -1

        for (y in 0 until height) {
            val rowOffset = y * width
            for (x in 0 until width) {
                val idx = rowOffset + x
                if (mask[idx].toInt() == 0 || visited[idx].toInt() != 0) continue

                var head = 0
                var tail = 0
                queue[tail++] = idx
                visited[idx] = 1
                var minX = x
                var maxX = x
                var minY = y
                var maxY = y

                while (head < tail) {
                    val curr = queue[head++]
                    val cx = curr % width
                    val cy = curr / width
                    if (cx < minX) minX = cx
                    if (cx > maxX) maxX = cx
                    if (cy < minY) minY = cy
                    if (cy > maxY) maxY = cy

                    if (cx > 0) {
                        val n = curr - 1
                        if (mask[n].toInt() != 0 && visited[n].toInt() == 0) { visited[n] = 1; queue[tail++] = n }
                    }
                    if (cx < width - 1) {
                        val n = curr + 1
                        if (mask[n].toInt() != 0 && visited[n].toInt() == 0) { visited[n] = 1; queue[tail++] = n }
                    }
                    if (cy > 0) {
                        val n = curr - width
                        if (mask[n].toInt() != 0 && visited[n].toInt() == 0) { visited[n] = 1; queue[tail++] = n }
                    }
                    if (cy < height - 1) {
                        val n = curr + width
                        if (mask[n].toInt() != 0 && visited[n].toInt() == 0) { visited[n] = 1; queue[tail++] = n }
                    }
                }

                if (tail > bestCount) {
                    bestCount = tail
                    bestPixels = queue.copyOf(tail)
                    bestMinX = minX
                    bestMinY = minY
                    bestMaxX = maxX
                    bestMaxY = maxY
                    bestStartX = x
                    bestStartY = y
                }
            }
        }

        val clean = ByteArray(total)
        bestPixels?.forEach { clean[it] = 1 }
        return Component(clean, bestCount, bestMinX, bestMinY, bestMaxX, bestMaxY, bestStartX, bestStartY)
    }

    // ------------------------------------------------------------------
    // 轮廓提取（demo contourExtraction）
    // ------------------------------------------------------------------

    /** Moore 邻域边界追踪（demo extractBoundaryPoints） */
    private fun traceBoundary(mask: ByteArray, width: Int, height: Int, hintX: Int, hintY: Int): List<Pt> {
        var startX = hintX
        var startY = hintY
        if (startX < 0 || startY < 0 || startX >= width || startY >= height || mask[startY * width + startX].toInt() == 0) {
            startX = -1
            startY = -1
            loop@ for (y in 0 until height) {
                for (x in 0 until width) {
                    if (mask[y * width + x].toInt() != 0) {
                        startX = x
                        startY = y
                        break@loop
                    }
                }
            }
        }
        if (startX < 0) return emptyList()

        // 8 邻域顺时针：N, NE, E, SE, S, SW, W, NW
        val dx = intArrayOf(0, 1, 1, 1, 0, -1, -1, -1)
        val dy = intArrayOf(-1, -1, 0, 1, 1, 1, 0, -1)
        val boundary = ArrayList<Pt>()
        var currX = startX
        var currY = startY
        var backtrackDir = 6 // 自西侧进入起点
        boundary.add(Pt(currX.toFloat(), currY.toFloat()))

        val maxSteps = width * height
        var steps = 0
        while (steps++ < maxSteps) {
            var nextX = -1
            var nextY = -1
            var nextDir = -1
            for (i in 0 until 8) {
                val dir = (backtrackDir + 1 + i) % 8
                val nx = currX + dx[dir]
                val ny = currY + dy[dir]
                if (nx in 0 until width && ny in 0 until height && mask[ny * width + nx].toInt() != 0) {
                    nextX = nx
                    nextY = ny
                    nextDir = dir
                    break
                }
            }
            if (nextX < 0) break
            if (nextX == startX && nextY == startY && boundary.size > 2) break
            boundary.add(Pt(nextX.toFloat(), nextY.toFloat()))
            currX = nextX
            currY = nextY
            backtrackDir = (nextDir + 4) % 8
        }
        return boundary
    }

    /** 闭合循环加权平滑 P' = 0.2·P(i-1) + 0.6·P(i) + 0.2·P(i+1)（demo smoothClosedContour） */
    private fun smoothClosed(points: List<Pt>, passes: Int): List<Pt> {
        if (points.size < 4 || passes <= 0) return points
        var curr = points
        repeat(passes) {
            val n = curr.size
            val next = ArrayList<Pt>(n)
            for (i in 0 until n) {
                val prev = curr[(i - 1 + n) % n]
                val self = curr[i]
                val nxt = curr[(i + 1) % n]
                next.add(Pt(0.2f * prev.x + 0.6f * self.x + 0.2f * nxt.x, 0.2f * prev.y + 0.6f * self.y + 0.2f * nxt.y))
            }
            curr = next
        }
        return curr
    }

    /** Ramer–Douglas–Peucker（迭代实现，避免长轮廓递归栈过深） */
    private fun simplifyRdp(points: List<Pt>, epsilon: Float): List<Pt> {
        val n = points.size
        if (n <= 3) return points
        val keep = BooleanArray(n)
        keep[0] = true
        keep[n - 1] = true
        val stack = ArrayDeque<IntArray>()
        stack.addLast(intArrayOf(0, n - 1))
        while (stack.isNotEmpty()) {
            val (start, end) = stack.removeLast()
            if (end - start < 2) continue
            var maxDist = 0f
            var index = -1
            val a = points[start]
            val b = points[end]
            for (i in start + 1 until end) {
                val d = perpendicularDistance(points[i], a, b)
                if (d > maxDist) {
                    maxDist = d
                    index = i
                }
            }
            if (index >= 0 && maxDist > epsilon) {
                keep[index] = true
                stack.addLast(intArrayOf(start, index))
                stack.addLast(intArrayOf(index, end))
            }
        }
        val out = ArrayList<Pt>()
        for (i in 0 until n) if (keep[i]) out.add(points[i])
        return out
    }

    private fun perpendicularDistance(p: Pt, a: Pt, b: Pt): Float {
        val dx = b.x - a.x
        val dy = b.y - a.y
        val mag = hypot(dx, dy)
        if (mag == 0f) return hypot(p.x - a.x, p.y - a.y)
        val u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (mag * mag)
        val ix = a.x + u * dx
        val iy = a.y + u * dy
        return hypot(p.x - ix, p.y - iy)
    }

    // ------------------------------------------------------------------
    // 资产 / 会话
    // ------------------------------------------------------------------

    private fun openSession(file: String, expectedSha: String, expectedBytes: Long): OrtSession {
        val bytes = readAssetBytes(file)
        require(bytes.size.toLong() == expectedBytes) { "$file 大小异常：${bytes.size}（期望 $expectedBytes）" }
        val sha = bytes.sha256()
        require(sha == expectedSha) { "$file SHA256 校验失败：$sha" }
        val options = OrtSession.SessionOptions()
        return try {
            environment.createSession(bytes, options)
        } finally {
            options.close()
        }
    }

    private fun readAssetBytes(name: String): ByteArray =
        context.assets.open(name).use { input ->
            ByteArrayOutputStream().use { out -> input.copyTo(out); out.toByteArray() }
        }

    override fun close() {
        if (encoderLazy.isInitialized()) encoderLazy.value.close()
        if (decoderLazy.isInitialized()) decoderLazy.value.close()
    }

    companion object {
        const val MODEL_ID = "Xenova/slimsam-77-uniform"
        const val ENCODER_FILE = "sam_vision_encoder_quantized.onnx"
        const val ENCODER_SHA256 = "cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971"
        const val ENCODER_BYTES = 8_882_165L
        const val DECODER_FILE = "sam_prompt_encoder_mask_decoder_quantized.onnx"
        const val DECODER_SHA256 = "cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2"
        const val DECODER_BYTES = 4_903_810L

        private const val IN_PIXEL_VALUES = "pixel_values"
        private const val OUT_EMBEDDINGS = "image_embeddings"
        private const val OUT_POS_EMBEDDINGS = "image_positional_embeddings"
        private const val IN_POINTS = "input_points"
        private const val IN_LABELS = "input_labels"
        private const val OUT_IOU = "iou_scores"
        private const val OUT_MASKS = "pred_masks"

        private const val INPUT_SIZE = 1024
        private const val LOW_RES = 256
        /** 256 / 1024：低分辩掩码到输入帧的采样比 */
        private const val LOW_RES_PER_INPUT = 0.25f
        private const val EMBED_CHANNELS = 256
        private const val EMBED_SIZE = 64
        private const val EMBED_FLOATS = EMBED_CHANNELS * EMBED_SIZE * EMBED_SIZE
        private const val MASK_CANDIDATES = 3

        private const val MEAN_R = 0.485f
        private const val MEAN_G = 0.456f
        private const val MEAN_B = 0.406f
        private const val STD_R = 0.229f
        private const val STD_G = 0.224f
        private const val STD_B = 0.225f

        /** demo：框外 45% 余量以外的像素视为非鱼体 */
        private const val CROP_GATE_RATIO = 0.45f
        private const val TRUST_COV_MIN = 0.18f
        private const val TRUST_COV_MAX = 0.85f
        private const val TRUST_SPAN_MIN = 0.48f
        private const val TRUST_IOU_MIN = 0.60f
        private const val MIN_COMPONENT_PIXELS = 60
        private const val MIN_CONTOUR_POINTS = 8
        /** demo 简化容差 2.2（1152px 图）；工作帧 ≤ 1024 取 2.0，点数超限时按 1.5× 放宽 */
        private const val RDP_EPSILON = 2.0f
        private const val MAX_POINTS = 220

        private fun directFloats(values: FloatArray): ByteBuffer {
            val buffer = ByteBuffer.allocateDirect(values.size * 4).order(ByteOrder.nativeOrder())
            buffer.asFloatBuffer().put(values)
            buffer.rewind()
            return buffer
        }

        private fun directLongs(values: LongArray): ByteBuffer {
            val buffer = ByteBuffer.allocateDirect(values.size * 8).order(ByteOrder.nativeOrder())
            buffer.asLongBuffer().put(values)
            buffer.rewind()
            return buffer
        }

        private fun ByteArray.sha256(): String =
            MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }
    }
}
