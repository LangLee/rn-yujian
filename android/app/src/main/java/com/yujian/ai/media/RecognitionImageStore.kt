package com.yujian.ai.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.yujian.ai.model.SelectedImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

object RecognitionImageStore {
    data class CameraTarget(val file: File, val uri: Uri)

    fun createCameraTarget(context: Context): CameraTarget {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "capture_${UUID.randomUUID()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return CameraTarget(file, uri)
    }

    suspend fun normalize(context: Context, uri: Uri, source: String): SelectedImage = withContext(Dispatchers.IO) {
        // Copy the provider URI into app-private cache once. This avoids relying on
        // the photo provider granting multiple readable streams and also makes
        // Google Photos / cloud-backed content URIs behave like local files.
        val tempDir = File(context.cacheDir, "gallery_imports").apply { mkdirs() }
        val tempFile = File(tempDir, "import_${UUID.randomUUID()}.img")
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                tempFile.outputStream().use { output -> input.copyTo(output) }
            } ?: error("无法读取照片")
            require(tempFile.length() > 0L) { "照片内容为空，请重新选择" }
            normalizeLocalFile(context, tempFile, source, "照片格式不受支持")
        } finally {
            tempFile.delete()
        }
    }

    suspend fun normalizeCameraFile(context: Context, file: File): SelectedImage = withContext(Dispatchers.IO) {
        require(file.exists() && file.length() > 0L) { "没有读取到拍照内容，请重新拍摄" }
        normalizeLocalFile(context, file, "camera", "拍照文件无法解析，请重新拍摄")
    }

    private fun normalizeLocalFile(
        context: Context,
        file: File,
        source: String,
        invalidMessage: String,
    ): SelectedImage {
        val rotation = runCatching { ExifInterface(file).rotationDegrees }.getOrDefault(0)

        // BitmapFactory intentionally returns null when inJustDecodeBounds=true;
        // valid decoding is determined from outWidth/outHeight instead.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { invalidMessage }

        var sample = 1
        val maxDimension = maxOf(bounds.outWidth, bounds.outHeight)
        while (maxDimension / sample > 2048) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = BitmapFactory.decodeFile(file.absolutePath, options)
            ?: error(invalidMessage)
        return persistNormalized(context, decoded, rotation, source)
    }

    private fun persistNormalized(
        context: Context,
        decoded: Bitmap,
        rotation: Int,
        source: String,
    ): SelectedImage {
        val oriented = if (rotation == 0) decoded else Bitmap.createBitmap(
            decoded, 0, 0, decoded.width, decoded.height,
            Matrix().apply { postRotate(rotation.toFloat()) }, true,
        )

        val dir = File(context.filesDir, "recognition_inputs").apply { mkdirs() }
        val normalized = File(dir, "input_${UUID.randomUUID()}.jpg")
        normalized.outputStream().use { output ->
            check(oriented.compress(Bitmap.CompressFormat.JPEG, 92, output)) { "无法保存识别照片" }
        }
        return SelectedImage(filePath = normalized.absolutePath, bitmap = oriented, source = source)
    }
}
