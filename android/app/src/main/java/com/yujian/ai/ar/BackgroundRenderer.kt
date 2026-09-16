package com.yujian.ai.ar

import android.content.Context
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * ARCore 相机画面背景渲染器。
 *
 * ARCore 不提供系统级相机预览，需要自己用 GL 把相机纹理（GL_TEXTURE_EXTERNAL_OES）
 * 铺满全屏；相机纹理 id 通过 Session.setCameraTextureName 交给 ARCore 写入。
 * 绘制时用 Frame.transformDisplayUvCoords 修正屏幕旋转/裁切后的 UV。
 * 实现遵循 ARCore 官方 hello_ar 示例（Apache License 2.0）。
 */
class BackgroundRenderer {

    companion object {
        private const val COORDS_PER_VERTEX = 2
        private const val VERTEX_STRIDE = COORDS_PER_VERTEX * Float.SIZE_BYTES

        private const val VERTEX_SHADER = """
            attribute vec4 a_Position;
            attribute vec2 a_TexCoord;
            varying vec2 v_TexCoord;
            void main() {
              gl_Position = a_Position;
              v_TexCoord = a_TexCoord;
            }
        """

        private const val FRAGMENT_SHADER = """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;
            varying vec2 v_TexCoord;
            uniform samplerExternalOES sTexture;
            void main() {
              gl_FragColor = texture2D(sTexture, v_TexCoord);
            }
        """

        private fun compileShader(type: Int, source: String): Int {
            val shader = GLES20.glCreateShader(type)
            GLES20.glShaderSource(shader, source)
            GLES20.glCompileShader(shader)
            val status = IntArray(1)
            GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
            check(status[0] == GLES20.GL_TRUE) { "BackgroundRenderer shader compile failed" }
            return shader
        }
    }

    private var program = 0
    private var positionAttrib = -1
    private var texCoordAttrib = -1
    private var textureId = -1

    private val quadCoords: FloatBuffer =
        floatArrayOf(-1.0f, -1.0f, +1.0f, -1.0f, -1.0f, +1.0f, +1.0f, +1.0f).toBuffer()
    private val quadTexCoords: FloatBuffer =
        floatArrayOf(0.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f).toBuffer()
    private val transformedTexCoords: FloatBuffer =
        FloatArray(8).toBuffer()

    private val lock = Any()

    val textureIdOrZero: Int get() = textureId

    /** GL 线程：创建 OES 纹理与着色器程序 */
    fun createOnGlThread(context: Context) {
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        textureId = textures[0]
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glTexParameteri(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MIN_FILTER,
            GLES20.GL_LINEAR,
        )
        GLES20.glTexParameteri(
            GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MAG_FILTER,
            GLES20.GL_LINEAR,
        )

        val vertexShader = compileShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
        val fragmentShader = compileShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
        program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertexShader)
        GLES20.glAttachShader(program, fragmentShader)
        GLES20.glLinkProgram(program)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        check(status[0] == GLES20.GL_TRUE) { "BackgroundRenderer program link failed" }

        positionAttrib = GLES20.glGetAttribLocation(program, "a_Position")
        texCoordAttrib = GLES20.glGetAttribLocation(program, "a_TexCoord")
    }

    /** GL 线程：把当前帧的相机画面铺满全屏 */
    fun draw(frame: Frame) {
        synchronized(lock) {
            if (frame.hasDisplayGeometryChanged()) {
                frame.transformDisplayUvCoords(quadTexCoords, transformedTexCoords)
            }
        }
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthMask(false)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glUseProgram(program)
        quadCoords.position(0)
        GLES20.glVertexAttribPointer(positionAttrib, COORDS_PER_VERTEX, GLES20.GL_FLOAT, false, VERTEX_STRIDE, quadCoords)
        GLES20.glEnableVertexAttribArray(positionAttrib)
        transformedTexCoords.position(0)
        GLES20.glVertexAttribPointer(texCoordAttrib, COORDS_PER_VERTEX, GLES20.GL_FLOAT, false, VERTEX_STRIDE, transformedTexCoords)
        GLES20.glEnableVertexAttribArray(texCoordAttrib)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(positionAttrib)
        GLES20.glDisableVertexAttribArray(texCoordAttrib)
        GLES20.glDepthMask(true)
    }

    private fun FloatArray.toBuffer(): FloatBuffer =
        ByteBuffer.allocateDirect(size * Float.SIZE_BYTES)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
            .apply {
                put(this@toBuffer)
                position(0)
            }
}

