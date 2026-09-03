package com.yujian.ai.contracts

import com.yujian.ai.ai.FishDetection
import com.yujian.ai.ai.FishInputAssessment
import com.yujian.ai.ai.NormalizedFishBox
import org.json.JSONArray
import org.json.JSONObject

/**
 * A detector prediction is deliberately named candidate_bbox.  It is never a
 * training ground-truth annotation until a human review gate accepts it.
 * Coordinates are normalized xywh values in the original image.
 */
data class CandidateBbox(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
) {
    init {
        require(x in 0f..1f && y in 0f..1f) { "candidate bbox origin must be normalized" }
        require(width in 0f..1f && height in 0f..1f) { "candidate bbox size must be normalized" }
        require(x + width <= 1.00001f && y + height <= 1.00001f) {
            "candidate bbox must stay inside the image"
        }
    }

    fun toJson(): JSONArray = JSONArray().apply {
        put(x.toDouble())
        put(y.toDouble())
        put(width.toDouble())
        put(height.toDouble())
    }

    companion object {
        fun fromBox(box: NormalizedFishBox): CandidateBbox {
            val normalized = box.normalized()
            return CandidateBbox(
                x = normalized.x1,
                y = normalized.y1,
                width = normalized.width,
                height = normalized.height,
            )
        }

        fun fromDetection(detection: FishDetection): CandidateBbox = fromBox(detection.box)
    }
}

data class DetectionContract(
    val imageId: String,
    val detectorVersion: String,
    val imageWidth: Int,
    val imageHeight: Int,
    val candidateBbox: CandidateBbox?,
    val confidence: Float,
    val bboxAreaRatio: Float,
    val source: String = SOURCE_ANDROID_DETECTOR,
    val status: String? = null,
    val reason: String? = null,
) {
    init {
        require(imageId.isNotBlank()) { "image_id is required" }
        require(detectorVersion.isNotBlank()) { "detector_version is required" }
        require(imageWidth > 0 && imageHeight > 0) { "image dimensions must be positive" }
        require(confidence.isFinite() && confidence in 0f..1f) { "confidence must be normalized" }
        require(bboxAreaRatio.isFinite() && bboxAreaRatio in 0f..1f) { "bbox_area_ratio must be normalized" }
        require(source.isNotBlank()) { "source is required" }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("image_id", imageId)
        put("detector_version", detectorVersion)
        put("image_width", imageWidth)
        put("image_height", imageHeight)
        put("candidate_bbox", candidateBbox?.toJson() ?: JSONObject.NULL)
        put("confidence", confidence.toDouble())
        put("bbox_area_ratio", bboxAreaRatio.toDouble())
        put("source", source)
        if (!status.isNullOrBlank()) put("status", status)
        if (!reason.isNullOrBlank()) put("reason", reason)
    }

    companion object {
        const val SOURCE_ANDROID_DETECTOR = "android_detector"
        const val CONTRACT_VERSION = "DETECTION_CONTRACT_V2"

        fun fromAssessment(
            imageId: String,
            detectorVersion: String,
            imageWidth: Int,
            imageHeight: Int,
            assessment: FishInputAssessment,
        ): DetectionContract {
            val primary = assessment.primary
            return DetectionContract(
                imageId = imageId,
                detectorVersion = detectorVersion,
                imageWidth = imageWidth,
                imageHeight = imageHeight,
                candidateBbox = primary?.let(CandidateBbox::fromDetection),
                confidence = primary?.confidence ?: 0f,
                bboxAreaRatio = primary?.areaRatio ?: 0f,
                status = assessment.status.wireName,
                reason = assessment.reason,
            )
        }
    }
}
