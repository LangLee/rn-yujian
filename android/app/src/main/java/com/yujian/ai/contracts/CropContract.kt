package com.yujian.ai.contracts

import org.json.JSONObject

data class CropContract(
    val sourceImageId: String,
    val cropPath: String?,
    val expandRatio: Float,
    val cropWidth: Int,
    val cropHeight: Int,
) {
    init {
        require(sourceImageId.isNotBlank()) { "source_image_id is required" }
        require(expandRatio >= 0f && expandRatio <= 1f) { "expand_ratio is out of range" }
        require(cropWidth > 0 && cropHeight > 0) { "crop dimensions must be positive" }
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("source_image_id", sourceImageId)
        put("crop_path", cropPath ?: JSONObject.NULL)
        put("expand_ratio", expandRatio.toDouble())
        put("crop_width", cropWidth)
        put("crop_height", cropHeight)
    }
}
