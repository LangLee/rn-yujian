package com.yujian.ai.ai

import android.graphics.Bitmap
import java.util.Locale

/**
 * 推理链路对齐辅助信息。
 * 用于比较 Python baseline 与 Android TFLite 输入是否一致。
 */
object InferenceDebug {
    fun bitmapSummary(tag: String, bitmap: Bitmap): String {
        return String.format(
            Locale.US,
            "%s width=%d height=%d config=%s",
            tag,
            bitmap.width,
            bitmap.height,
            bitmap.config
        )
    }

    fun tensorPreview(values: FloatArray, count: Int = 20): String {
        return values.take(count).joinToString(",") { "%.6f".format(Locale.US, it) }
    }
}
