package com.yujian.ai.ai

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * Production DET_FISH_v0.1 runtime.
 *
 * Contract mirrors backend app/detector_runtime.py:
 * - YOLOX-Nano, 416x416
 * - RGB source -> Pillow-compatible BILINEAR resize -> top-left letterbox with 114
 * - BGR, FLOAT32, NCHW, values remain in 0..255
 * - decoded ONNX rows: [cx, cy, w, h, objectness, fish_probability]
 * - confidence = objectness * fish_probability
 * - weak threshold filtering before NMS
 */
class FishDetectorEngine(private val context: Context) : AutoCloseable {
    data class DetectorRun(
        val modelVersion: String,
        val onnxSha256: String,
        val inputSize: Int,
        val inputScale: Float,
        val inputDrawWidth: Int,
        val inputDrawHeight: Int,
        val latencyMs: Long,
        val detections: List<FishDetection>,
    )

    private data class PreparedInput(
        val buffer: ByteBuffer,
        val scale: Float,
        val drawWidth: Int,
        val drawHeight: Int,
    )

    private data class VerifiedModel(
        val bytes: ByteArray,
        val sha256: String,
        val inputSize: Int,
        val inputName: String,
    )

    private data class PillowAxisCoefficients(
        val starts: IntArray,
        val weights: Array<IntArray>,
    )

    private val environment: OrtEnvironment = OrtEnvironment.getEnvironment()

    private val verifiedModel: VerifiedModel by lazy { verifyModelBundle() }

    private val sessionLazy = lazy {
        val options = OrtSession.SessionOptions()
        try {
            environment.createSession(verifiedModel.bytes, options)
        } finally {
            options.close()
        }.also { session ->
            require(session.inputNames.size == 1) { "DET_FISH_v0.1 必须只有一个输入 tensor" }
            require(session.outputNames.size == 1) { "DET_FISH_v0.1 必须只有一个输出 tensor" }
            require(session.inputNames.first() == verifiedModel.inputName) {
                "DET_FISH_v0.1 输入名不一致：runtime=${session.inputNames.first()} metadata=${verifiedModel.inputName}"
            }
        }
    }

    private val session: OrtSession get() = sessionLazy.value

    suspend fun detect(bitmap: Bitmap): DetectorRun = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
        require(bitmap.width > 0 && bitmap.height > 0) { "鱼体检测输入图片尺寸无效" }
        val started = System.nanoTime()
        val model = verifiedModel
        val prepared = prepareInput(bitmap, model.inputSize)
        val shape = longArrayOf(1, 3, model.inputSize.toLong(), model.inputSize.toLong())

        val rows = OnnxTensor.createTensor(environment, prepared.buffer.asFloatBuffer(), shape).use { tensor ->
            session.run(mapOf(model.inputName to tensor)).use { result ->
                val output = result[0] as? OnnxTensor
                    ?: error("DET_FISH_v0.1 输出不是 FLOAT tensor")
                materializeRows(output.value)
            }
        }

        val detections = decodeAndNms(
            rows = rows,
            scale = prepared.scale,
            sourceWidth = bitmap.width,
            sourceHeight = bitmap.height,
            minConfidence = FishDetectionQualityGate.WEAK_CONFIDENCE,
            nmsIou = FishDetectionQualityGate.NMS_IOU,
        )
        DetectorRun(
            modelVersion = MODEL_VERSION,
            onnxSha256 = model.sha256,
            inputSize = model.inputSize,
            inputScale = prepared.scale,
            inputDrawWidth = prepared.drawWidth,
            inputDrawHeight = prepared.drawHeight,
            latencyMs = (System.nanoTime() - started) / 1_000_000,
            detections = detections,
        )
    }

    private fun verifyModelBundle(): VerifiedModel {
        val modelBytes = readAssetBytes(MODEL_FILE)
        val metadataText = readAssetText(METADATA_FILE)
        val contractText = readAssetText(CONTRACT_FILE)
        val metadata = JSONObject(metadataText)
        val contract = JSONObject(contractText)

        require(metadata.getString("model_version") == MODEL_VERSION) { "Detector 模型版本不匹配" }
        require(metadata.getString("model_family") == MODEL_FAMILY) { "Detector 模型家族不匹配" }
        require(metadata.getString("dataset_version") == DATASET_VERSION) { "Detector 数据集版本不匹配" }

        val actualSha = modelBytes.sha256()
        require(metadata.getString("onnx_sha256") == actualSha) { "Detector ONNX SHA256 校验失败：$actualSha" }
        require(metadata.getLong("onnx_bytes") == modelBytes.size.toLong()) {
            "Detector ONNX 大小异常：${modelBytes.size}"
        }

        require(contract.getString("contract_version") == FishDetectionQualityGate.CONTRACT_VERSION) {
            "Detector recognition contract 版本不匹配"
        }
        val detector = contract.getJSONObject("detector")
        require(detector.getString("model_family") == MODEL_FAMILY)
        val inputSize = detector.getInt("input_size")
        require(inputSize == EXPECTED_INPUT_SIZE) { "Detector 输入必须为 ${EXPECTED_INPUT_SIZE}x${EXPECTED_INPUT_SIZE}" }
        require(closeEnough(detector.getDouble("strong_confidence").toFloat(), FishDetectionQualityGate.STRONG_CONFIDENCE))
        require(closeEnough(detector.getDouble("weak_confidence").toFloat(), FishDetectionQualityGate.WEAK_CONFIDENCE))
        require(closeEnough(detector.getDouble("nms_iou").toFloat(), FishDetectionQualityGate.NMS_IOU))

        val quality = contract.getJSONObject("quality_gate")
        require(closeEnough(quality.getDouble("min_primary_area_ratio").toFloat(), FishDetectionQualityGate.MIN_PRIMARY_AREA_RATIO))
        require(closeEnough(quality.getDouble("incomplete_edge_margin_ratio").toFloat(), FishDetectionQualityGate.INCOMPLETE_EDGE_MARGIN_RATIO))
        val crop = contract.getJSONObject("crop")
        require(closeEnough(crop.getDouble("expand_ratio").toFloat(), FishDetectionQualityGate.CROP_EXPAND_RATIO))
        require(crop.getInt("classifier_size") == 224)
        require(crop.getString("resize_mode") == "letterbox")

        val onnx = metadata.getJSONObject("onnx")
        val shape = onnx.getJSONArray("input_shape")
        require(shape.length() == 4 && shape.getInt(0) == 1 && shape.getInt(1) == 3)
        require(shape.getInt(2) == inputSize && shape.getInt(3) == inputSize) {
            "Detector metadata 输入 shape 与 contract 不一致"
        }
        val inputName = onnx.getString("input_name")
        require(inputName.isNotBlank())

        return VerifiedModel(modelBytes, actualSha, inputSize, inputName)
    }

    private fun prepareInput(bitmap: Bitmap, inputSize: Int): PreparedInput {
        val scale = min(inputSize / bitmap.width.toFloat(), inputSize / bitmap.height.toFloat())
        val drawWidth = max(1, (bitmap.width * scale).toInt())
        val drawHeight = max(1, (bitmap.height * scale).toInt())
        val resizedPixels = pillowBilinearResize(bitmap, drawWidth, drawHeight)
        val pixelCount = inputSize * inputSize
        val values = FloatArray(pixelCount * 3) { YOLOX_FILL.toFloat() }
        resizedPixels.forEachIndexed { sourceIndex, pixel ->
            val x = sourceIndex % drawWidth
            val y = sourceIndex / drawWidth
            val target = y * inputSize + x
            val r = pixel shr 16 and 0xFF
            val g = pixel shr 8 and 0xFF
            val b = pixel and 0xFF
            values[target] = b.toFloat()
            values[pixelCount + target] = g.toFloat()
            values[pixelCount * 2 + target] = r.toFloat()
        }

        val buffer = ByteBuffer.allocateDirect(values.size * 4).order(ByteOrder.nativeOrder())
        buffer.asFloatBuffer().put(values)
        buffer.rewind()
        return PreparedInput(buffer, scale, drawWidth, drawHeight)
    }

    /**
     * Mirrors Pillow's 8-bit Image.Resampling.BILINEAR resize path.
     *
     * Pillow resize is a separable convolution. During downsampling it widens the
     * bilinear support by the scale factor (anti-aliasing), quantizes normalized
     * coefficients to 22-bit fixed point, clips after the horizontal pass, then
     * repeats the same process vertically. Skia's Bitmap.createScaledBitmap does
     * not use this exact contract and materially changes borderline detector scores.
     */
    private fun pillowBilinearResize(bitmap: Bitmap, outWidth: Int, outHeight: Int): IntArray {
        require(outWidth > 0 && outHeight > 0)
        val inWidth = bitmap.width
        val inHeight = bitmap.height
        val source = IntArray(inWidth * inHeight)
        bitmap.getPixels(source, 0, inWidth, 0, 0, inWidth, inHeight)
        if (inWidth == outWidth && inHeight == outHeight) {
            return IntArray(source.size) { index -> source[index] or (0xFF shl 24) }
        }

        val horizontalCoefficients = pillowBilinearCoefficients(inWidth, outWidth)
        val horizontal = IntArray(outWidth * inHeight)
        for (y in 0 until inHeight) {
            val sourceRow = y * inWidth
            val targetRow = y * outWidth
            for (xOut in 0 until outWidth) {
                val start = horizontalCoefficients.starts[xOut]
                val weights = horizontalCoefficients.weights[xOut]
                var red = PILLOW_ROUNDING
                var green = PILLOW_ROUNDING
                var blue = PILLOW_ROUNDING
                for (offset in weights.indices) {
                    val pixel = source[sourceRow + start + offset]
                    val weight = weights[offset]
                    red += (pixel shr 16 and 0xFF) * weight
                    green += (pixel shr 8 and 0xFF) * weight
                    blue += (pixel and 0xFF) * weight
                }
                horizontal[targetRow + xOut] = packRgb(
                    pillowClip(red),
                    pillowClip(green),
                    pillowClip(blue),
                )
            }
        }

        val verticalCoefficients = pillowBilinearCoefficients(inHeight, outHeight)
        val output = IntArray(outWidth * outHeight)
        for (yOut in 0 until outHeight) {
            val start = verticalCoefficients.starts[yOut]
            val weights = verticalCoefficients.weights[yOut]
            val targetRow = yOut * outWidth
            for (x in 0 until outWidth) {
                var red = PILLOW_ROUNDING
                var green = PILLOW_ROUNDING
                var blue = PILLOW_ROUNDING
                for (offset in weights.indices) {
                    val pixel = horizontal[(start + offset) * outWidth + x]
                    val weight = weights[offset]
                    red += (pixel shr 16 and 0xFF) * weight
                    green += (pixel shr 8 and 0xFF) * weight
                    blue += (pixel and 0xFF) * weight
                }
                output[targetRow + x] = packRgb(
                    pillowClip(red),
                    pillowClip(green),
                    pillowClip(blue),
                )
            }
        }
        return output
    }

    private fun pillowBilinearCoefficients(inSize: Int, outSize: Int): PillowAxisCoefficients {
        val scale = inSize.toDouble() / outSize.toDouble()
        val filterScale = max(scale, 1.0)
        val support = filterScale
        val starts = IntArray(outSize)
        val weights = Array(outSize) { IntArray(0) }
        for (outIndex in 0 until outSize) {
            val center = (outIndex + 0.5) * scale
            var minSource = (center - support + 0.5).toInt()
            if (minSource < 0) minSource = 0
            var maxSource = (center + support + 0.5).toInt()
            if (maxSource > inSize) maxSource = inSize
            val count = maxSource - minSource
            val raw = DoubleArray(count)
            var total = 0.0
            for (offset in 0 until count) {
                val distance = abs((offset + minSource - center + 0.5) / filterScale)
                val weight = if (distance < 1.0) 1.0 - distance else 0.0
                raw[offset] = weight
                total += weight
            }
            val fixed = IntArray(count)
            if (total != 0.0) {
                for (offset in 0 until count) {
                    val normalized = raw[offset] / total
                    fixed[offset] = if (normalized < 0.0) {
                        (-0.5 + normalized * PILLOW_PRECISION_SCALE).toInt()
                    } else {
                        (0.5 + normalized * PILLOW_PRECISION_SCALE).toInt()
                    }
                }
            }
            starts[outIndex] = minSource
            weights[outIndex] = fixed
        }
        return PillowAxisCoefficients(starts, weights)
    }

    override fun close() {
        if (sessionLazy.isInitialized()) sessionLazy.value.close()
    }

    private fun readAssetBytes(name: String): ByteArray =
        context.assets.open(name).use { input ->
            ByteArrayOutputStream().use { out -> input.copyTo(out); out.toByteArray() }
        }

    private fun readAssetText(name: String): String =
        context.assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }

    companion object {
        const val MODEL_VERSION = "DET_FISH_v0.1"
        const val DATASET_VERSION = "DET_DS_v0.1"
        const val MODEL_FAMILY = "YOLOX_NANO"
        const val MODEL_FILE = "fish_detector_yolox_nano_v0_1.onnx"
        const val METADATA_FILE = "detector_metadata.json"
        const val CONTRACT_FILE = "recognition_pipeline_v1.json"
        const val EXPECTED_INPUT_SIZE = 416
        const val YOLOX_FILL = 114
        private const val PILLOW_PRECISION_BITS = 22
        private const val PILLOW_PRECISION_SCALE = 1 shl PILLOW_PRECISION_BITS
        private const val PILLOW_ROUNDING = 1 shl (PILLOW_PRECISION_BITS - 1)

        internal fun decodeAndNms(
            rows: Array<FloatArray>,
            scale: Float,
            sourceWidth: Int,
            sourceHeight: Int,
            minConfidence: Float = FishDetectionQualityGate.WEAK_CONFIDENCE,
            nmsIou: Float = FishDetectionQualityGate.NMS_IOU,
        ): List<FishDetection> {
            require(scale > 0f && sourceWidth > 0 && sourceHeight > 0)
            val decoded = rows.mapNotNull { row ->
                if (row.size < 6) return@mapNotNull null
                val cx = row[0]
                val cy = row[1]
                val width = row[2]
                val height = row[3]
                val confidence = row[4] * row[5]
                if (!confidence.isFinite() || confidence < minConfidence ||
                    !cx.isFinite() || !cy.isFinite() || !width.isFinite() || !height.isFinite()
                ) return@mapNotNull null

                val box = NormalizedFishBox(
                    x1 = (cx - width / 2f) / scale / sourceWidth,
                    y1 = (cy - height / 2f) / scale / sourceHeight,
                    x2 = (cx + width / 2f) / scale / sourceWidth,
                    y2 = (cy + height / 2f) / scale / sourceHeight,
                ).normalized()
                if (box.areaRatio <= 0f) null else FishDetection(confidence, box, "fish")
            }
            return nms(decoded, nmsIou)
        }

        internal fun nms(detections: List<FishDetection>, iouThreshold: Float): List<FishDetection> {
            val kept = mutableListOf<FishDetection>()
            detections.sortedByDescending { it.confidence }.forEach { candidate ->
                if (kept.all { iou(candidate.box, it.box) <= iouThreshold }) kept += candidate
            }
            return kept
        }

        internal fun iou(left: NormalizedFishBox, right: NormalizedFishBox): Float {
            val a = left.normalized()
            val b = right.normalized()
            val overlapX = max(0f, min(a.x2, b.x2) - max(a.x1, b.x1))
            val overlapY = max(0f, min(a.y2, b.y2) - max(a.y1, b.y1))
            val overlap = overlapX * overlapY
            val union = a.areaRatio + b.areaRatio - overlap
            return if (union > 0f) overlap / union else 0f
        }

        private fun materializeRows(value: Any): Array<FloatArray> {
            val batch = value as? Array<*> ?: error("DET_FISH_v0.1 输出维度异常")
            require(batch.size == 1) { "DET_FISH_v0.1 batch size 必须为 1" }
            val rows = batch[0] as? Array<*> ?: error("DET_FISH_v0.1 输出 rows 异常")
            return Array(rows.size) { index ->
                rows[index] as? FloatArray ?: error("DET_FISH_v0.1 row[$index] 不是 FloatArray")
            }
        }

        private fun packRgb(red: Int, green: Int, blue: Int): Int =
            (0xFF shl 24) or (red shl 16) or (green shl 8) or blue

        private fun pillowClip(accumulator: Int): Int =
            (accumulator shr PILLOW_PRECISION_BITS).coerceIn(0, 255)

        private fun ByteArray.sha256(): String =
            MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }

        private fun closeEnough(left: Float, right: Float): Boolean = kotlin.math.abs(left - right) <= 1e-6f
    }
}
