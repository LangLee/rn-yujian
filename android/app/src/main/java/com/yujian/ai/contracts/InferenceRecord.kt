package com.yujian.ai.contracts

import com.yujian.ai.ai.FishDetectionQualityGate
import com.yujian.ai.ai.ProductionRecognitionResult
import com.yujian.ai.model.RecognitionPrediction
import com.yujian.ai.model.SelectedImage
import org.json.JSONObject

/** Immutable-at-write inference asset; feedback is attached to the same image_id later. */
data class InferenceRecord(
    val imageId: String,
    val timestamp: String,
    val source: String,
    val sourceImagePath: String,
    val detection: DetectionContract?,
    val crop: CropContract?,
    val classification: ClassifierContract?,
    val feedback: FeedbackContract? = null,
    val pipelineStatus: String,
    val qualityLevel: String,
    val qualityReason: String,
    val contractVersion: String = CONTRACT_VERSION,
) {
    init {
        require(imageId.isNotBlank()) { "image_id is required" }
        require(timestamp.isNotBlank()) { "timestamp is required" }
        require(sourceImagePath.isNotBlank()) { "source_image_path is required" }
        require(pipelineStatus.isNotBlank()) { "pipeline_status is required" }
        require(qualityLevel.isNotBlank()) { "quality_level is required" }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("contract_version", contractVersion)
        put("image_id", imageId)
        put("timestamp", timestamp)
        put("source", source)
        put("source_image_path", sourceImagePath)
        put("detection", detection?.toJson() ?: JSONObject.NULL)
        put("crop", crop?.toJson() ?: JSONObject.NULL)
        put("classification", classification?.toJson() ?: JSONObject.NULL)
        put("feedback", feedback?.toJson() ?: JSONObject.NULL)
        put("pipeline_status", pipelineStatus)
        put("quality_level", qualityLevel)
        put("quality_reason", qualityReason)
    }

    companion object {
        const val CONTRACT_VERSION = "INFERENCE_RECORD_V2"

        fun fromResult(
            image: SelectedImage,
            result: ProductionRecognitionResult,
            crop: CropContract?,
            timestamp: String,
        ): InferenceRecord {
            val detector = DetectionContract.fromAssessment(
                imageId = image.imageId,
                detectorVersion = result.detectorRun.modelVersion,
                imageWidth = image.bitmap.width,
                imageHeight = image.bitmap.height,
                assessment = result.assessment,
            )
            return InferenceRecord(
                imageId = image.imageId,
                timestamp = timestamp,
                source = image.source,
                sourceImagePath = image.filePath,
                detection = detector,
                crop = crop,
                classification = result.prediction?.let(ClassifierContract::fromPrediction),
                pipelineStatus = result.status.wireName,
                qualityLevel = result.assessment.qualityLevel.wireName,
                qualityReason = result.assessment.qualityReason,
            )
        }

        fun withFeedback(existing: InferenceRecord, feedback: FeedbackContract): InferenceRecord =
            existing.copy(feedback = feedback)
    }
}
