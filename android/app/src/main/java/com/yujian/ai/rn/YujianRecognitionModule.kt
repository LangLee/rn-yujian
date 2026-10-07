package com.yujian.ai.rn

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.yujian.ai.ai.FishRecognitionPipeline
import com.yujian.ai.ai.InferenceTrace
import com.yujian.ai.ai.ProductionRecognitionResult
import com.yujian.ai.feedback.FeedbackDraft
import com.yujian.ai.feedback.FeedbackRepository
import com.yujian.ai.inference.InferenceAsset
import com.yujian.ai.inference.InferenceRecorder
import com.yujian.ai.media.RecognitionImageStore
import com.yujian.ai.model.RecognitionPrediction
import com.yujian.ai.model.SelectedImage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * React Native bridge over the production Detector -> Crop -> Classifier pipeline.
 *
 * The inference implementation (ONNX detector, quality gate, crop expand,
 * TFLite classifier) is shared verbatim with the native Android app, so the
 * recognition output parity is preserved. Bitmaps never cross the bridge;
 * JS receives JSON contracts plus file:// paths for previews.
 */
class YujianRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "YujianRecognition"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val appContext: Context get() = reactApplicationContext.applicationContext

    private val pipelineLazy = lazy { FishRecognitionPipeline(appContext) }
    private val recorderLazy = lazy { InferenceRecorder(appContext) }
    private val feedbackLazy = lazy { FeedbackRepository(appContext) }

    /** In-memory selected images keyed by stable image_id (yj_img_<uuid>). */
    private val images = ConcurrentHashMap<String, SelectedImage>()

    /** Latest pipeline result per image_id, consumed by record(). */
    private val results = ConcurrentHashMap<String, ProductionRecognitionResult>()

    /** Persisted INFERENCE_RECORD_V2 assets per image_id, consumed by attachFeedbackAndSubmit(). */
    private val assets = ConcurrentHashMap<String, InferenceAsset>()

    override fun getName(): String = NAME

    override fun invalidate() {
        super.invalidate()
        closeEngines()
    }

    /** EXIF-orient, downsample to 2048px and persist as JPEG92 in app-private storage. */
    @ReactMethod
    fun normalizeImage(uri: String, source: String, promise: Promise) {
        scope.launch {
            try {
                val selected = RecognitionImageStore.normalize(appContext, Uri.parse(uri), source)
                images[selected.imageId] = selected
                promise.resolve(
                    Arguments.createMap().apply {
                        putString("imageId", selected.imageId)
                        putString("filePath", selected.filePath)
                        putString("source", selected.source)
                        putDouble("width", selected.bitmap.width.toDouble())
                        putDouble("height", selected.bitmap.height.toDouble())
                    },
                )
            } catch (error: Exception) {
                promise.reject("E_NORMALIZE", error.message ?: "照片读取失败", error)
            }
        }
    }

    /** Run Detector -> QualityGate -> Crop -> Classifier on the device. */
    @ReactMethod
    fun recognize(imageId: String, promise: Promise) {
        scope.launch {
            try {
                val selected = requireImage(imageId)
                val result = pipelineLazy.value.recognize(selected.bitmap)
                results[imageId] = result
                promise.resolve(serializeResult(selected, result))
            } catch (error: Exception) {
                promise.reject("E_RECOGNIZE", error.message ?: "识别失败，请重新选择照片", error)
            }
        }
    }

    /** Persist the INFERENCE_RECORD_V2 contract, original image and crop for this image_id. */
    @ReactMethod
    fun record(imageId: String, promise: Promise) {
        scope.launch {
            try {
                val selected = requireImage(imageId)
                val result = results[imageId]
                    ?: throw IllegalStateException("先调用 recognize 再调用 record")
                val asset = recorderLazy.value.record(selected, result)
                assets[imageId] = asset
                promise.resolve(
                    Arguments.createMap().apply {
                        putString("recordPath", asset.recordFile.absolutePath)
                        putString("imagePath", asset.imageFile.absolutePath)
                        asset.cropFile?.let { putString("cropPath", it.absolutePath) }
                    },
                )
            } catch (error: Exception) {
                promise.reject("E_RECORD", error.message ?: "推理记录保存失败", error)
            }
        }
    }

    /** Attach user feedback to the stored record and upload (or queue offline). */
    @ReactMethod
    fun attachFeedbackAndSubmit(imageId: String, feedback: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val asset = assets[imageId]
                    ?: throw IllegalStateException("先调用 record 再提交反馈")
                val draft = FeedbackDraft(
                    sourceEventId = feedback.getString("sourceEventId")
                        ?: "APP_${java.util.UUID.randomUUID()}",
                    feedbackType = feedback.getString("feedbackType") ?: "confirmed",
                    modelVersion = feedback.getString("modelVersion") ?: "",
                    predictedSpecies = feedback.getString("predictedSpecies") ?: "",
                    confidence = if (feedback.hasKey("confidence")) feedback.getDouble("confidence").toFloat() else 0f,
                    correctedSpecies = feedback.getString("correctedSpecies"),
                    userNote = feedback.getString("userNote"),
                    imageId = imageId,
                )
                val updated = recorderLazy.value.attachFeedback(asset, draft)
                assets[imageId] = updated
                val uploaded = feedbackLazy.value.submitInferenceOrQueue(updated)
                promise.resolve(uploaded)
            } catch (error: Exception) {
                promise.reject("E_FEEDBACK", error.message ?: "反馈提交失败", error)
            }
        }
    }

    /** Flush the offline feedback and inference queues; returns the number of sent entries. */
    @ReactMethod
    fun flushQueued(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(feedbackLazy.value.flushQueued())
            } catch (error: Exception) {
                promise.reject("E_FLUSH", error.message ?: "离线队列刷新失败", error)
            }
        }
    }

    /**
     * 登录后注入/清除访问令牌：反馈与推理上传改用 JWT Bearer 鉴权，
     * 令牌就绪前提交的内容会进入离线队列等待冲刷。
     */
    @ReactMethod
    fun setAuthToken(token: String?, promise: Promise) {
        feedbackLazy.value.accessToken = token?.takeIf { it.isNotBlank() }
        promise.resolve(true)
    }

    /** Drop in-memory bitmaps for one image; persisted contracts are untouched. */
    @ReactMethod
    fun releaseImage(imageId: String, promise: Promise) {
        images.remove(imageId)
        results.remove(imageId)
        promise.resolve(imageId)
    }

    /** Warm up detector + classifier sessions so the first recognize() is not slow. */
    @ReactMethod
    fun warmup(promise: Promise) {
        scope.launch {
            try {
                // Touching the lazy pipeline constructor loads and verifies both models.
                pipelineLazy.value
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("E_WARMUP", error.message ?: "模型加载失败", error)
            }
        }
    }

    @ReactMethod
    fun close(promise: Promise) {
        scope.launch {
            closeEngines()
            promise.resolve(true)
        }
    }

    private fun requireImage(imageId: String): SelectedImage =
        images[imageId] ?: throw IllegalStateException("图片不存在或已释放：$imageId")

    private fun closeEngines() {
        if (pipelineLazy.isInitialized()) pipelineLazy.value.close()
        images.clear()
        results.clear()
        scope.cancel()
    }

    private fun serializeResult(selected: SelectedImage, result: ProductionRecognitionResult): WritableMap {
        val prediction = result.prediction
        val assessment = result.assessment
        return Arguments.createMap().apply {
            putString("status", result.status.wireName)
            putBoolean("ready", result.ready)
            putDouble("totalLatencyMs", result.totalLatencyMs.toDouble())
            putDouble("sourceWidth", selected.bitmap.width.toDouble())
            putDouble("sourceHeight", selected.bitmap.height.toDouble())

            putMap("detectorRun", Arguments.createMap().apply {
                putString("modelVersion", result.detectorRun.modelVersion)
                putString("onnxSha256", result.detectorRun.onnxSha256)
                putDouble("inputSize", result.detectorRun.inputSize.toDouble())
                putDouble("latencyMs", result.detectorRun.latencyMs.toDouble())
                putArray("detections", Arguments.createArray().apply {
                    result.detectorRun.detections.forEach { detection ->
                        pushMap(
                            Arguments.createMap().apply {
                                putDouble("confidence", detection.confidence.toDouble())
                                putString("className", detection.className)
                                putMap("box", boxToMap(detection.box.normalized()))
                            },
                        )
                    }
                })
            })

            putMap("assessment", Arguments.createMap().apply {
                putString("status", assessment.status.wireName)
                putString("qualityLevel", assessment.qualityLevel.wireName)
                putString("qualityReason", assessment.qualityReason)
                putDouble("bboxAreaRatio", (assessment.bboxAreaRatio ?: 0f).toDouble())
                assessment.primary?.let { primary ->
                    putMap("primary", Arguments.createMap().apply {
                        putDouble("confidence", primary.confidence.toDouble())
                        putString("className", primary.className)
                        putMap("box", boxToMap(primary.box.normalized()))
                    })
                }
                assessment.cropBox?.let { cropBox -> putMap("cropBox", boxToMap(cropBox.normalized())) }
                putArray("strongDetections", detectionList(assessment.strongDetections))
                putArray("weakDetections", detectionList(assessment.weakDetections))
            })

            prediction?.let { value -> putMap("prediction", predictionToMap(value)) }

            result.cropPixels?.let { pixels ->
                putArray("cropPixels", Arguments.createArray().apply {
                    pixels.forEach { pushInt(it) }
                })
            }

            // Previews written as JPEG files so RN <Image> can render them directly.
            writeCropPreview(selected, result)?.let { putString("cropPreviewPath", it) }
            prediction?.modelInputBitmap?.let { bitmap ->
                putString("modelInputPath", writePreviewBitmap(bitmap, "${selected.imageId}_model_input.jpg"))
            }

            putString("debugReport", InferenceTrace.lastReport)
        }
    }

    private fun predictionToMap(prediction: RecognitionPrediction): WritableMap =
        Arguments.createMap().apply {
            putString("modelVersion", prediction.modelVersion)
            putString("modelSha256", prediction.modelSha256)
            putDouble("latencyMs", prediction.latencyMs.toDouble())
            putBoolean("lowConfidence", prediction.lowConfidence)
            putMap("top1", Arguments.createMap().apply {
                putInt("classIndex", prediction.top1.classIndex)
                putString("speciesKey", prediction.top1.speciesKey)
                putString("speciesName", prediction.top1.speciesName)
                putDouble("confidence", prediction.top1.confidence.toDouble())
            })
            putArray("candidates", Arguments.createArray().apply {
                prediction.candidates.forEach { candidate ->
                    pushMap(
                        Arguments.createMap().apply {
                            putInt("classIndex", candidate.classIndex)
                            putString("speciesKey", candidate.speciesKey)
                            putString("speciesName", candidate.speciesName)
                            putDouble("confidence", candidate.confidence.toDouble())
                        },
                    )
                }
            })
        }

    private fun detectionList(detections: List<com.yujian.ai.ai.FishDetection>) =
        Arguments.createArray().apply {
            detections.forEach { detection ->
                pushMap(
                    Arguments.createMap().apply {
                        putDouble("confidence", detection.confidence.toDouble())
                        putString("className", detection.className)
                        putMap("box", boxToMap(detection.box.normalized()))
                    },
                )
            }
        }

    private fun boxToMap(box: com.yujian.ai.ai.NormalizedFishBox): WritableMap =
        Arguments.createMap().apply {
            putDouble("x1", box.x1.toDouble())
            putDouble("y1", box.y1.toDouble())
            putDouble("x2", box.x2.toDouble())
            putDouble("y2", box.y2.toDouble())
        }

    /** Mirror of the result-screen crop preview: expanded crop cut from the normalized bitmap. */
    private fun writeCropPreview(selected: SelectedImage, result: ProductionRecognitionResult): String? {
        val pixels = result.cropPixels ?: return null
        if (pixels.size < 4) return null
        val source = selected.bitmap
        val left = pixels[0].coerceIn(0, source.width - 1)
        val top = pixels[1].coerceIn(0, source.height - 1)
        val right = pixels[2].coerceIn(left + 1, source.width)
        val bottom = pixels[3].coerceIn(top + 1, source.height)
        val crop = Bitmap.createBitmap(source, left, top, right - left, bottom - top)
        return writePreviewBitmap(crop, "${selected.imageId}_crop_preview.jpg")
    }

    private fun writePreviewBitmap(bitmap: Bitmap, name: String): String {
        val dir = File(appContext.cacheDir, "rn_previews").apply { mkdirs() }
        val file = File(dir, name)
        FileOutputStream(file).use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)) { "无法保存预览图" }
        }
        return "file://${file.absolutePath}"
    }
}
