package com.yujian.ai.feedback

import android.content.Context
import com.yujian.ai.rn.BuildConfig
import com.yujian.ai.inference.InferenceAsset
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL


data class FeedbackDraft(
    val sourceEventId: String,
    val feedbackType: String,
    val modelVersion: String,
    val predictedSpecies: String,
    val confidence: Float,
    val correctedSpecies: String?,
    val userNote: String? = null,
    val imageId: String? = null,
)

class FeedbackRepository(private val context: Context) {
    private val queueDir = File(context.filesDir, "feedback_queue").apply { mkdirs() }
    private val inferenceQueueDir = File(context.filesDir, "inference_queue").apply { mkdirs() }

    suspend fun submitOrQueue(imageFile: File, draft: FeedbackDraft): Boolean = withContext(Dispatchers.IO) {
        val entry = persistQueueEntry(imageFile, draft)
        if (!isConfigured()) return@withContext false
        if (upload(entry.first, JSONObject(entry.second.readText(Charsets.UTF_8)), smoke = false)) {
            entry.first.delete()
            entry.second.delete()
            true
        } else false
    }

    suspend fun flushQueued(): Int = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext 0
        var sent = 0
        queueDir.listFiles { f -> f.extension == "json" }?.sortedBy { it.lastModified() }?.forEach { meta ->
            val image = File(queueDir, meta.nameWithoutExtension + ".jpg")
            if (image.exists() && upload(image, JSONObject(meta.readText(Charsets.UTF_8)), smoke = false)) {
                image.delete(); meta.delete(); sent++
            }
        }
        sent + flushInferenceQueue()
    }

    /** Upload the complete Detector → Crop → Classifier record through Contract v2. */
    suspend fun submitInferenceOrQueue(asset: InferenceAsset): Boolean = withContext(Dispatchers.IO) {
        val queued = persistInferenceQueueEntry(asset)
        if (!isConfigured()) return@withContext false
        if (uploadInference(queued.record, queued.image, queued.crop)) {
            queued.record.delete()
            queued.image.delete()
            queued.crop?.delete()
            true
        } else {
            false
        }
    }

    /**
     * UAT-only transport smoke. It exercises the same authenticated multipart client
     * as production feedback, while the backend smoke mode writes + verifies + deletes
     * a temporary GCS object and does not create a FeedbackEvent.
     */
    suspend fun submitUatSmoke(imageFile: File, sourceEventId: String): Boolean = withContext(Dispatchers.IO) {
        if (!isConfigured()) return@withContext false
        val json = JSONObject()
            .put("source_event_id", sourceEventId)
            .put("feedback_type", "confirmed")
            .put("source", "android_uat_smoke")
            .put("model_version", "android-uat-smoke")
            .put("predicted_species", "草鱼")
            .put("confidence", 0.99)
            .put("corrected_species", JSONObject.NULL)
            .put("user_note", JSONObject.NULL)
        upload(imageFile, json, smoke = true)
    }

    fun isNetworkConfigured(): Boolean = isConfigured()

    private fun isConfigured(): Boolean = BuildConfig.FEEDBACK_BASE_URL.isNotBlank() && BuildConfig.FEEDBACK_INGEST_KEY.isNotBlank()

    private fun persistQueueEntry(source: File, draft: FeedbackDraft): Pair<File, File> {
        val base = draft.sourceEventId.replace(Regex("[^A-Za-z0-9_.-]"), "_")
        val image = File(queueDir, "$base.jpg")
        if (!image.exists()) source.copyTo(image, overwrite = true)
        val meta = File(queueDir, "$base.json")
        if (!meta.exists()) {
            val json = JSONObject()
                .put("source_event_id", draft.sourceEventId)
                .put("image_id", draft.imageId ?: JSONObject.NULL)
                .put("feedback_type", draft.feedbackType)
                .put("source", "android_app")
                .put("model_version", draft.modelVersion)
                .put("predicted_species", draft.predictedSpecies)
                .put("confidence", draft.confidence.toDouble())
                .put("corrected_species", draft.correctedSpecies ?: JSONObject.NULL)
                .put("ai_prediction", draft.predictedSpecies)
                .put("user_label", draft.correctedSpecies ?: JSONObject.NULL)
                .put("is_error", draft.correctedSpecies != null && draft.correctedSpecies != draft.predictedSpecies)
                .put("hard_case", draft.correctedSpecies != null && draft.correctedSpecies != draft.predictedSpecies)
                .put("user_note", draft.userNote ?: JSONObject.NULL)
            meta.writeText(json.toString(), Charsets.UTF_8)
        }
        return image to meta
    }

    private data class QueuedInference(val record: File, val image: File, val crop: File?)

    private fun persistInferenceQueueEntry(asset: InferenceAsset): QueuedInference {
        val base = asset.record.imageId.replace(Regex("[^A-Za-z0-9_.-]"), "_")
        val record = File(inferenceQueueDir, "$base.json")
        val image = File(inferenceQueueDir, "$base.jpg")
        val crop = asset.cropFile?.let { File(inferenceQueueDir, "${base}_crop.jpg") }
        if (!record.exists()) asset.recordFile.copyTo(record, overwrite = true)
        if (!image.exists()) asset.imageFile.copyTo(image, overwrite = true)
        if (crop != null && !crop.exists()) asset.cropFile!!.copyTo(crop, overwrite = true)
        return QueuedInference(record, image, crop)
    }

    private fun flushInferenceQueue(): Int {
        var sent = 0
        inferenceQueueDir.listFiles { file -> file.extension == "json" }?.sortedBy { it.lastModified() }?.forEach { record ->
            val base = record.nameWithoutExtension
            val image = File(inferenceQueueDir, "$base.jpg")
            val crop = File(inferenceQueueDir, "${base}_crop.jpg").takeIf { it.exists() }
            if (image.exists() && uploadInference(record, image, crop)) {
                record.delete(); image.delete(); crop?.delete(); sent++
            }
        }
        return sent
    }

    private fun upload(image: File, json: JSONObject, smoke: Boolean): Boolean = runCatching {
        val boundary = "YuJianBoundary${System.currentTimeMillis()}"
        val baseUrl = BuildConfig.FEEDBACK_BASE_URL.trimEnd('/')
        val connection = (URL("$baseUrl/api/feedback/ingest").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("X-YuJian-Ingest-Key", BuildConfig.FEEDBACK_INGEST_KEY)
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }
        DataOutputStream(connection.outputStream).use { out ->
            fun field(name: String, value: String?) {
                if (value == null) return
                out.writeBytes("--$boundary\r\n")
                out.writeBytes("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
                out.write(value.toByteArray(Charsets.UTF_8))
                out.writeBytes("\r\n")
            }
            field("source_event_id", json.getString("source_event_id"))
            field("feedback_type", json.getString("feedback_type"))
            field("source", json.optString("source", "android_app"))
            field("model_version", json.optString("model_version").ifBlank { null })
            field("predicted_species", json.optString("predicted_species").ifBlank { null })
            field("confidence", json.optDouble("confidence").takeIf { !it.isNaN() }?.toString())
            field("corrected_species", if (json.isNull("corrected_species")) null else json.optString("corrected_species"))
            field("user_note", if (json.isNull("user_note")) null else json.optString("user_note"))
            if (smoke) field("smoke", "true")
            out.writeBytes("--$boundary\r\n")
            out.writeBytes("Content-Disposition: form-data; name=\"file\"; filename=\"feedback.jpg\"\r\n")
            out.writeBytes("Content-Type: image/jpeg\r\n\r\n")
            image.inputStream().use { it.copyTo(out) }
            out.writeBytes("\r\n--$boundary--\r\n")
        }
        val code = connection.responseCode
        if (code in 200..299) connection.inputStream.use { it.readBytes() } else connection.errorStream?.use { it.readBytes() }
        connection.disconnect()
        code in 200..299
    }.getOrDefault(false)

    private fun uploadInference(record: File, image: File, crop: File?): Boolean = runCatching {
        val boundary = "YuJianInferenceBoundary${System.currentTimeMillis()}"
        val baseUrl = BuildConfig.FEEDBACK_BASE_URL.trimEnd('/')
        val connection = (URL("$baseUrl/api/v1/inference/upload").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("X-YuJian-Ingest-Key", BuildConfig.FEEDBACK_INGEST_KEY)
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }
        DataOutputStream(connection.outputStream).use { out ->
            fun filePart(field: String, file: File, filename: String, contentType: String) {
                out.writeBytes("--$boundary\r\n")
                out.writeBytes("Content-Disposition: form-data; name=\"$field\"; filename=\"$filename\"\r\n")
                out.writeBytes("Content-Type: $contentType\r\n\r\n")
                file.inputStream().use { it.copyTo(out) }
                out.writeBytes("\r\n")
            }
            filePart("record", record, "InferenceRecord.json", "application/json")
            filePart("image", image, image.name, "image/jpeg")
            crop?.let { filePart("crop", it, it.name, "image/jpeg") }
            out.writeBytes("--$boundary--\r\n")
        }
        val code = connection.responseCode
        if (code in 200..299) connection.inputStream.use { it.readBytes() } else connection.errorStream?.use { it.readBytes() }
        connection.disconnect()
        code in 200..299
    }.getOrDefault(false)
}
