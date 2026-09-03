package com.yujian.ai.ai

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt

enum class FishInputStatus(val wireName: String) {
    READY("ready"),
    NO_FISH("no_fish"),
    UNCERTAIN("uncertain"),
    MULTIPLE_FISH("multiple_fish"),
    INCOMPLETE_FISH("incomplete_fish"),
    FISH_TOO_SMALL("fish_too_small"),
}

/**
 * Android UX quality level layered on top of the frozen detector contract.
 *
 * GOOD and WARNING are both classifier-eligible. INVALID is the only level that
 * blocks MODEL_M1_v0.2. This keeps common field photos usable when a tail touches
 * the frame or the fish is lightly occluded, while still blocking ambiguous input.
 */
enum class FishQualityLevel(val wireName: String) {
    GOOD("good"),
    WARNING("warning"),
    INVALID("invalid"),
}

data class NormalizedFishBox(
    val x1: Float,
    val y1: Float,
    val x2: Float,
    val y2: Float,
) {
    fun normalized(): NormalizedFishBox {
        val left = minOf(x1, x2).coerceIn(0f, 1f)
        val top = minOf(y1, y2).coerceIn(0f, 1f)
        val right = maxOf(x1, x2).coerceIn(0f, 1f)
        val bottom = maxOf(y1, y2).coerceIn(0f, 1f)
        return NormalizedFishBox(left, top, right, bottom)
    }

    val width: Float get() { val b = normalized(); return (b.x2 - b.x1).coerceAtLeast(0f) }
    val height: Float get() { val b = normalized(); return (b.y2 - b.y1).coerceAtLeast(0f) }
    val areaRatio: Float get() = width * height

    fun touchesEdge(margin: Float): Boolean {
        val b = normalized()
        return b.x1 <= margin || b.y1 <= margin || b.x2 >= 1f - margin || b.y2 >= 1f - margin
    }

    fun expand(ratio: Float): NormalizedFishBox {
        val b = normalized()
        val dx = b.width * ratio
        val dy = b.height * ratio
        return NormalizedFishBox(
            (b.x1 - dx).coerceAtLeast(0f),
            (b.y1 - dy).coerceAtLeast(0f),
            (b.x2 + dx).coerceAtMost(1f),
            (b.y2 + dy).coerceAtMost(1f),
        )
    }
}

data class FishDetection(
    val confidence: Float,
    val box: NormalizedFishBox,
    val className: String = "fish",
) {
    val areaRatio: Float get() = box.areaRatio
}

data class FishInputAssessment(
    val status: FishInputStatus,
    val primary: FishDetection?,
    val cropBox: NormalizedFishBox?,
    val strongDetections: List<FishDetection>,
    val weakDetections: List<FishDetection>,
    val reason: String,
    val qualityLevel: FishQualityLevel = FishQualityLevel.GOOD,
) {
    val qualityReason: String get() = reason
    val bboxAreaRatio: Float? get() = primary?.areaRatio
    val isClassifierEligible: Boolean get() = qualityLevel != FishQualityLevel.INVALID && cropBox != null
}

object FishDetectionQualityGate {
    const val CONTRACT_VERSION = "RECOGNITION_PIPELINE_v1"
    const val QUALITY_GATE_VERSION = "QUALITY_GATE_v1.1"
    const val STRONG_CONFIDENCE = 0.35f
    const val WEAK_CONFIDENCE = 0.20f
    const val NMS_IOU = 0.45f
    const val MIN_PRIMARY_AREA_RATIO = 0.08f
    const val INCOMPLETE_EDGE_MARGIN_RATIO = 0.015f
    const val CROP_EXPAND_RATIO = 0.15f

    private fun rankScore(detection: FishDetection): Float =
        detection.confidence.coerceAtLeast(0f) * sqrt(detection.areaRatio.coerceAtLeast(0f))

    fun assess(detections: List<FishDetection>): FishInputAssessment {
        val fish = detections
            .filter { it.className.equals("fish", ignoreCase = true) && it.box.areaRatio > 0f }
            .map { it.copy(box = it.box.normalized()) }

        val strong = fish
            .filter { it.confidence >= STRONG_CONFIDENCE }
            .sortedByDescending(::rankScore)
        val weak = fish
            .filter { it.confidence >= WEAK_CONFIDENCE && it.confidence < STRONG_CONFIDENCE }
            .sortedByDescending(::rankScore)

        if (strong.isEmpty()) {
            return if (weak.isNotEmpty()) {
                FishInputAssessment(
                    FishInputStatus.UNCERTAIN,
                    weak.first(),
                    weak.first().box.expand(CROP_EXPAND_RATIO),
                    strong,
                    weak,
                    "weak_fish_detection_only",
                    FishQualityLevel.WARNING,
                )
            } else {
                FishInputAssessment(
                    FishInputStatus.NO_FISH,
                    null,
                    null,
                    strong,
                    weak,
                    "no_fish_detection_above_weak_threshold",
                    FishQualityLevel.INVALID,
                )
            }
        }

        val primary = strong.first()
        if (strong.size >= 2) {
            return FishInputAssessment(
                FishInputStatus.MULTIPLE_FISH,
                primary,
                null,
                strong,
                weak,
                "multiple_strong_fish_detections",
                FishQualityLevel.INVALID,
            )
        }

        if (primary.box.touchesEdge(INCOMPLETE_EDGE_MARGIN_RATIO)) {
            return FishInputAssessment(
                FishInputStatus.INCOMPLETE_FISH,
                primary,
                primary.box.expand(CROP_EXPAND_RATIO),
                strong,
                weak,
                "primary_fish_bbox_touches_image_edge",
                FishQualityLevel.WARNING,
            )
        }

        if (primary.areaRatio < MIN_PRIMARY_AREA_RATIO) {
            return FishInputAssessment(
                FishInputStatus.FISH_TOO_SMALL,
                primary,
                null,
                strong,
                weak,
                "primary_fish_area_below_minimum",
                FishQualityLevel.INVALID,
            )
        }

        return FishInputAssessment(
            FishInputStatus.READY,
            primary,
            primary.box.expand(CROP_EXPAND_RATIO),
            strong,
            weak,
            "single_complete_fish_ready_for_classifier",
            FishQualityLevel.GOOD,
        )
    }

    /** Exact parity contract with backend: floor left/top, ceil right/bottom. */
    fun cropBoxPixels(
        box: NormalizedFishBox,
        width: Int,
        height: Int,
    ): IntArray {
        require(width > 0 && height > 0)
        val b = box.normalized()
        val left = floor(b.x1 * width).toInt().coerceIn(0, width - 1)
        val top = floor(b.y1 * height).toInt().coerceIn(0, height - 1)
        val right = ceil(b.x2 * width).toInt().coerceIn(left + 1, width)
        val bottom = ceil(b.y2 * height).toInt().coerceIn(top + 1, height)
        return intArrayOf(left, top, right, bottom)
    }
}
