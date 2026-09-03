package com.yujian.ai.ai

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.Log
import com.yujian.ai.model.RecognitionCandidate
import com.yujian.ai.model.RecognitionPrediction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.exp
import kotlin.math.min

class FishRecognitionEngine(private val context: Context) : AutoCloseable {
    private data class PreparedBitmap(
        val bitmap: Bitmap,
        val scale: Float,
        val drawWidth: Float,
        val drawHeight: Float,
        val padLeft: Float,
        val padTop: Float,
    )

    private data class ModelInput(
        val buffer: ByteBuffer,
        val values: FloatArray,
    )

    private val modelBytes: ByteArray by lazy {
        context.assets.open(MODEL_FILE).use { input ->
            ByteArrayOutputStream().use { out -> input.copyTo(out); out.toByteArray() }
        }.also { bytes ->
            val actual = bytes.sha256()
            check(actual == MODEL_SHA256) { "鱼类识别模型校验失败：$actual" }
            check(bytes.size == MODEL_BYTES) { "鱼类识别模型大小异常：${bytes.size}" }
            InferenceTrace.model(actual, bytes.size)
        }
    }

    private val interpreterLazy = lazy {
        val buffer = ByteBuffer.allocateDirect(modelBytes.size).order(ByteOrder.nativeOrder())
        buffer.put(modelBytes).rewind()
        Interpreter(buffer, Interpreter.Options().apply { setNumThreads(4) })
    }
    private val interpreter get() = interpreterLazy.value

    suspend fun recognize(
        bitmap: Bitmap,
        pipelineContext: InferenceTrace.PipelineContext? = null,
    ): RecognitionPrediction = withContext(Dispatchers.Default) {
        val started = System.nanoTime()
        val inputTensor = interpreter.getInputTensor(0)
        val inputShape = inputTensor.shape()
        require(inputTensor.dataType() == DataType.FLOAT32) { "MODEL_M1_v0.2 输入必须为 FLOAT32" }
        require(inputShape.size == 4) { "MODEL_M1_v0.2 输入必须为 4D tensor" }

        val nchw = inputShape[1] == 3
        val nhwc = inputShape[3] == 3
        require(nchw || nhwc) { "模型输入必须包含 3 个 RGB 通道，实际=${inputShape.contentToString()}" }
        val height = if (nchw) inputShape[2] else inputShape[1]
        val width = if (nchw) inputShape[3] else inputShape[2]
        val layout = if (nchw) "NCHW" else "NHWC"

        InferenceTrace.bitmap("classifier_source_bitmap", bitmap)
        val prepared = prepareModelBitmap(bitmap, width, height)
        InferenceTrace.bitmap("model_input_letterbox", prepared.bitmap)
        val input = makeInputBuffer(prepared.bitmap, nchw)

        val outputTensor = interpreter.getOutputTensor(0)
        require(outputTensor.dataType() == DataType.FLOAT32) { "MODEL_M1_v0.2 输出必须为 FLOAT32" }
        val count = outputTensor.shape().last()
        require(count == MODEL_LABELS.size) { "模型输出类别数应为 ${MODEL_LABELS.size}，实际为 $count" }

        val output = ByteBuffer.allocateDirect(count * 4).order(ByteOrder.nativeOrder())
        interpreter.run(input.buffer, output)
        output.rewind()
        val logits = FloatArray(count) { output.float }
        val probabilities = softmax(logits)
        val candidates = MODEL_LABELS.mapIndexed { index, label ->
            RecognitionCandidate(index, label.first, label.second, probabilities[index].coerceIn(0f, 1f))
        }.sortedByDescending { it.confidence }
        val top1 = candidates.first()
        val latencyMs = (System.nanoTime() - started) / 1_000_000

        InferenceTrace.report(
            modelVersion = MODEL_VERSION,
            modelSha256 = MODEL_SHA256,
            sourceBitmap = bitmap,
            preparedBitmap = prepared.bitmap,
            inputShape = inputShape,
            layout = layout,
            scale = prepared.scale,
            drawWidth = prepared.drawWidth,
            drawHeight = prepared.drawHeight,
            padLeft = prepared.padLeft,
            padTop = prepared.padTop,
            paddingRgb = intArrayOf(PADDING_R, PADDING_G, PADDING_B),
            normalizationMean = IMAGENET_MEAN,
            normalizationStd = IMAGENET_STD,
            inputValues = input.values,
            logits = logits,
            probabilities = probabilities,
            labels = MODEL_LABELS,
            latencyMs = latencyMs,
            pipelineContext = pipelineContext,
        )

        Log.i(
            LOG_TAG,
            "model=$MODEL_VERSION top1=${top1.classIndex}:${top1.speciesKey} confidence=${top1.confidence} latencyMs=$latencyMs",
        )
        Log.i(
            LOG_TAG,
            "top3=" + candidates.take(3).joinToString { "${it.classIndex}:${it.speciesKey}:${it.confidence}" },
        )
        RecognitionPrediction(
            modelVersion = MODEL_VERSION,
            modelSha256 = MODEL_SHA256,
            top1 = top1,
            candidates = candidates,
            latencyMs = latencyMs,
            modelInputBitmap = prepared.bitmap,
        )
    }

    /**
     * MODEL_M1_v0.2 classifier preprocessing.
     *
     * The caller owns source selection. The production FishRecognitionPipeline passes
     * a detector-expanded fish crop; classifier-only parity tests can pass a direct bitmap.
     * This method preserves the entire supplied bitmap, fits it inside the model square,
     * and pads with ImageNet-mean RGB so padding becomes ~0 after normalization.
     */
    private fun prepareModelBitmap(bitmap: Bitmap, width: Int, height: Int): PreparedBitmap {
        require(bitmap.width > 0 && bitmap.height > 0)
        val scale = min(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height)
        val drawWidth = bitmap.width * scale
        val drawHeight = bitmap.height * scale
        val left = (width - drawWidth) / 2f
        val top = (height - drawHeight) / 2f

        val prepared = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { out ->
            val canvas = Canvas(out)
            canvas.drawColor(Color.rgb(PADDING_R, PADDING_G, PADDING_B))
            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
            canvas.drawBitmap(bitmap, null, RectF(left, top, left + drawWidth, top + drawHeight), paint)
        }
        return PreparedBitmap(
            bitmap = prepared,
            scale = scale,
            drawWidth = drawWidth,
            drawHeight = drawHeight,
            padLeft = left,
            padTop = top,
        )
    }

    private fun makeInputBuffer(bitmap: Bitmap, nchw: Boolean): ModelInput {
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val pixelCount = pixels.size
        val values = FloatArray(pixelCount * 3)

        pixels.forEachIndexed { index, pixel ->
            val r = normalize(pixel shr 16 and 0xFF, IMAGENET_MEAN[0], IMAGENET_STD[0])
            val g = normalize(pixel shr 8 and 0xFF, IMAGENET_MEAN[1], IMAGENET_STD[1])
            val b = normalize(pixel and 0xFF, IMAGENET_MEAN[2], IMAGENET_STD[2])
            if (nchw) {
                values[index] = r
                values[pixelCount + index] = g
                values[pixelCount * 2 + index] = b
            } else {
                val offset = index * 3
                values[offset] = r
                values[offset + 1] = g
                values[offset + 2] = b
            }
        }

        InferenceTrace.tensorHead(values)
        val buffer = ByteBuffer.allocateDirect(values.size * 4).order(ByteOrder.nativeOrder()).also { out ->
            out.asFloatBuffer().put(values)
            out.rewind()
        }
        return ModelInput(buffer = buffer, values = values)
    }

    private fun normalize(channel: Int, mean: Float, std: Float): Float = (channel / 255f - mean) / std

    private fun softmax(values: FloatArray): FloatArray {
        val max = values.maxOrNull() ?: 0f
        val exps = values.map { exp((it - max).toDouble()).toFloat() }
        val denominator = exps.sum().coerceAtLeast(0.0001f)
        return exps.map { it / denominator }.toFloatArray()
    }

    override fun close() {
        if (interpreterLazy.isInitialized()) interpreterLazy.value.close()
    }

    private fun ByteArray.sha256(): String =
        MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }

    companion object {
        const val MODEL_FILE = "fish_classifier.tflite"
        const val MODEL_VERSION = "MODEL_M1_v0.2"
        const val MODEL_BYTES = 6_220_308
        const val MODEL_SHA256 = "9575ede5c6c85b850647016d76e8e5175fa9ea6b609c47c83f54b4062e47d14e"
        private const val LOG_TAG = "FishRecognitionEngine"

        private const val PADDING_R = 124
        private const val PADDING_G = 116
        private const val PADDING_B = 104
        private val IMAGENET_MEAN = floatArrayOf(0.485f, 0.456f, 0.406f)
        private val IMAGENET_STD = floatArrayOf(0.229f, 0.224f, 0.225f)

        val MODEL_LABELS = listOf(
            "grass_carp" to "草鱼",
            "bighead_carp" to "鳙鱼",
            "silver_carp" to "白鲢",
            "common_carp" to "鲤鱼",
            "crucian_carp" to "鲫鱼",
            "largemouth_bass" to "加州鲈",
            "snakehead" to "黑鱼",
            "yellow_catfish" to "黄骨鱼",
            "black_carp" to "青鱼",
        )
    }
}
