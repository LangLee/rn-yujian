package com.yujian.ai.inference

import android.content.Context
import android.graphics.Bitmap
import com.yujian.ai.ai.ProductionRecognitionResult
import com.yujian.ai.contracts.CropContract
import com.yujian.ai.contracts.FeedbackContract
import com.yujian.ai.contracts.InferenceRecord
import com.yujian.ai.model.SelectedImage
import com.yujian.ai.feedback.FeedbackDraft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Files persisted for one image_id; all paths are app-private and retryable. */
data class InferenceAsset(
    val record: InferenceRecord,
    val recordFile: File,
    val imageFile: File,
    val cropFile: File?,
)

/**
 * Persists the production detector → crop → classifier result without changing
 * the inference implementation.  Writes use a temporary sibling and rename so
 * a process death cannot leave a partially written JSON artifact.
 */
class InferenceRecorder(context: Context) {
    private val root = File(context.filesDir, "yujian/inference")

    suspend fun record(
        image: SelectedImage,
        result: ProductionRecognitionResult,
        now: Date = Date(),
    ): InferenceAsset = withContext(Dispatchers.IO) {
        require(image.imageId.startsWith("yj_img_")) { "image_id must be a generated yj_img UUID" }
        require(File(image.filePath).exists()) { "source image is not persisted" }

        val dayPath = DAY_FORMAT.withUtc().format(now)
        val dayDir = File(root, dayPath).apply { mkdirs() }
        val safeId = image.imageId.replace(Regex("[^A-Za-z0-9_.-]"), "_")
        val imageFile = File(dayDir, "$safeId.jpg")
        copyAtomically(File(image.filePath), imageFile)

        val cropPixels = result.cropPixels
        val cropFile = if (cropPixels != null && cropPixels.size >= 4) {
            val left = cropPixels[0].coerceIn(0, image.bitmap.width - 1)
            val top = cropPixels[1].coerceIn(0, image.bitmap.height - 1)
            val right = cropPixels[2].coerceIn(left + 1, image.bitmap.width)
            val bottom = cropPixels[3].coerceIn(top + 1, image.bitmap.height)
            val crop = Bitmap.createBitmap(image.bitmap, left, top, right - left, bottom - top)
            val destination = File(dayDir, "${safeId}_crop.jpg")
            try {
                writeBitmapAtomically(crop, destination)
            } finally {
                if (crop !== image.bitmap && !crop.isRecycled) crop.recycle()
            }
            destination
        } else {
            null
        }

        val cropContract = cropFile?.let {
            CropContract(
                sourceImageId = image.imageId,
                cropPath = it.absolutePath,
                expandRatio = com.yujian.ai.ai.FishDetectionQualityGate.CROP_EXPAND_RATIO,
                cropWidth = result.cropPixels!![2] - result.cropPixels[0],
                cropHeight = result.cropPixels[3] - result.cropPixels[1],
            )
        }
        val record = InferenceRecord.fromResult(
            image = image,
            result = result,
            crop = cropContract,
            timestamp = TIMESTAMP_FORMAT.withUtc().format(now),
        )
        val recordFile = File(dayDir, "$safeId.json")
        writeTextAtomically(recordFile, record.toJson().toString(2))
        InferenceAsset(record, recordFile, imageFile, cropFile)
    }

    /** Attach user feedback to the same JSON artifact; this never promotes it to truth. */
    suspend fun attachFeedback(asset: InferenceAsset, draft: FeedbackDraft): InferenceAsset = withContext(Dispatchers.IO) {
        val rootObject = JSONObject(asset.recordFile.readText(Charsets.UTF_8))
        val imageId = rootObject.optString("image_id")
        require(imageId == asset.record.recordId()) { "inference record identity mismatch" }
        if (draft.imageId != null) require(draft.imageId == imageId) { "feedback image_id mismatch" }
        val feedback = FeedbackContract.fromDraft(draft.copy(imageId = imageId))
        rootObject.put("feedback", feedback.toJson())
        writeTextAtomically(asset.recordFile, rootObject.toString(2))
        asset.copy(record = asset.record.copy(feedback = feedback))
    }

    private fun InferenceRecord.recordId(): String = imageId

    private fun copyAtomically(source: File, destination: File) {
        val temporary = File(destination.parentFile, ".${destination.name}.tmp")
        source.inputStream().use { input -> temporary.outputStream().use { output -> input.copyTo(output) } }
        replaceAtomically(temporary, destination)
    }

    private fun writeBitmapAtomically(bitmap: Bitmap, destination: File) {
        val temporary = File(destination.parentFile, ".${destination.name}.tmp")
        temporary.outputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)) { "无法保存 inference crop" }
        }
        replaceAtomically(temporary, destination)
    }

    private fun writeTextAtomically(destination: File, text: String) {
        val temporary = File(destination.parentFile, ".${destination.name}.tmp")
        temporary.writeText(text, Charsets.UTF_8)
        replaceAtomically(temporary, destination)
    }

    private fun replaceAtomically(temporary: File, destination: File) {
        if (destination.exists() && !destination.delete()) error("无法更新 inference asset")
        check(temporary.renameTo(destination)) { "无法提交 inference asset" }
    }

    private fun SimpleDateFormat.withUtc(): SimpleDateFormat = apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    companion object {
        private val DAY_FORMAT = SimpleDateFormat("yyyy/MM/dd", Locale.US)
        private val TIMESTAMP_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    }
}
