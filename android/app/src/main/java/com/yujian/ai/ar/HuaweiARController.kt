package com.yujian.ai.ar

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.view.View
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.huawei.hiar.AREnginesApk
import com.huawei.hiar.ARFrame
import com.huawei.hiar.ARHitResult
import com.huawei.hiar.ARPlane
import com.huawei.hiar.ARPoint
import com.huawei.hiar.ARSession
import com.huawei.hiar.ARTrackable
import com.huawei.hiar.ARWorldTrackingConfig
import com.huawei.hiar.exceptions.ARUnavailableClientSdkTooOldException
import com.huawei.hiar.exceptions.ARUnavailableDeviceNotCompatibleException
import com.huawei.hiar.exceptions.ARUnavailableEmuiNotCompatibleException
import com.huawei.hiar.exceptions.ARUnavailableServiceApkTooOldException
import com.huawei.hiar.exceptions.ARUnavailableServiceNotInstalledException
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * 华为 AR Engine 控制器（HMS 设备：华为 / 荣耀）。
 *
 * AR Engine 与 ARCore 架构同构（会话 / 相机纹理 / hitTest / 平面），
 * 但类与包互不兼容，故按同一 ARMeasureController 契约独立实现：
 * 会话生命周期 + GL 相机背景（共享 BackgroundRenderer）+ 水平面检测 + hitTest。
 */
class HuaweiARController(
    private val context: Context,
    private val emitEvent: AREventEmitter,
) : ARMeasureController {

    private val glView = GLSurfaceView(context)
    private val backgroundRenderer = BackgroundRenderer()
    private var session: ARSession? = null
    private var sessionResumed = false
    @Volatile
    private var latestFrame: ARFrame? = null
    private var textureBound = false
    private var planeAnnounced = false
    private var surfaceWidth = 0
    private var surfaceHeight = 0
    private val density = context.resources.displayMetrics.density

    override val contentView: View = glView

    private val renderer = object : GLSurfaceView.Renderer {
        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            GLES20.glClearColor(0f, 0f, 0f, 1f)
            runCatching {
                backgroundRenderer.createOnGlThread(context)
                session?.let { s ->
                    s.setCameraTextureName(backgroundRenderer.textureIdOrZero)
                    textureBound = true
                    if (surfaceWidth > 0 && surfaceHeight > 0) {
                        s.setDisplayGeometry(displayRotation(), surfaceWidth, surfaceHeight)
                    }
                }
            }.onFailure {
                postError("gl_init_failed")
            }
        }

        override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
            surfaceWidth = width
            surfaceHeight = height
            session?.setDisplayGeometry(displayRotation(), width, height)
        }

        override fun onDrawFrame(gl: GL10?) {
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
            val s = session ?: return
            if (!textureBound) {
                return
            }
            val frame = try {
                s.update()
            } catch (e: Exception) {
                // AR Engine 异常为 unchecked（ARFatalException 等）
                null
            } ?: return
            if (frame.timestampNs == 0L) {
                return
            }
            latestFrame = frame
            runCatching { backgroundRenderer.draw(frame.asBackgroundFrame()) }
            maybeAnnouncePlane(s)
        }
    }

    init {
        glView.setEGLContextClientVersion(2)
        glView.setRenderer(renderer)
        glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        glView.preserveEGLContextOnPause = true
    }

    override fun onAttachedToWindow() {
        startSession()
        glView.onResume()
    }

    override fun onDetachedFromWindow() {
        glView.onPause()
        stopSession()
    }

    override fun onHostVisibilityChanged(visible: Boolean) {
        if (visible) {
            resumeSession()
            glView.onResume()
        } else {
            pauseSession()
            glView.onPause()
        }
    }

    override fun release() {
        glView.onPause()
        stopSession()
    }

    @SuppressLint("SwitchIntDef")
    private fun displayRotation(): Int {
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        return windowManager.defaultDisplay.rotation
    }

    private fun startSession() {
        if (session != null) {
            return
        }
        try {
            val s = ARSession(context)
            val config = ARWorldTrackingConfig(s)
            // 鱼获摆在地面/台面：只检测水平面
            config.planeFindingMode =
                com.huawei.hiar.ARConfigBase.PlaneFindingMode.HORIZONTAL_ONLY
            s.configure(config)
            session = s
            resumeSession(config)
        } catch (e: ARUnavailableServiceNotInstalledException) {
            postError("engine_not_installed")
        } catch (e: ARUnavailableServiceApkTooOldException) {
            postError("engine_too_old")
        } catch (e: ARUnavailableClientSdkTooOldException) {
            postError("engine_too_old")
        } catch (e: ARUnavailableDeviceNotCompatibleException) {
            postError("unsupported_device")
        } catch (e: ARUnavailableEmuiNotCompatibleException) {
            postError("unsupported_device")
        } catch (e: Exception) {
            postError("session_failed")
        }
    }

    private fun resumeSession(config: ARWorldTrackingConfig? = null) {
        val s = session ?: return
        if (sessionResumed) {
            return
        }
        try {
            if (config != null) {
                s.resume(config)
            } else {
                s.resume()
            }
            sessionResumed = true
        } catch (e: Exception) {
            postError("camera_unavailable")
        }
    }

    private fun pauseSession() {
        runCatching { session?.pause() }
        sessionResumed = false
        latestFrame = null
    }

    private fun stopSession() {
        runCatching { session?.stop() }
        session = null
        sessionResumed = false
        latestFrame = null
    }

    private fun maybeAnnouncePlane(s: ARSession) {
        if (planeAnnounced) {
            return
        }
        val tracking = s.getAllTrackables(ARPlane::class.java)
            .any { it.trackingState == ARTrackable.TrackingState.TRACKING }
        if (tracking) {
            planeAnnounced = true
            emitEvent("planeDetected", null)
        }
    }

    override fun hitTest(dpX: Float, dpY: Float, promise: Promise) {
        val frame = latestFrame
        if (frame == null || session == null) {
            promise.reject("E_NO_FRAME", "AR 会话未就绪")
            return
        }
        glView.queueEvent {
            try {
                // AR Engine 提供 view 像素坐标的 hitTest(float, float)
                val hits = frame.hitTest(dpX * density, dpY * density)
                val chosen = chooseHit(hits)
                if (chosen == null) {
                    promise.resolve(null)
                } else {
                    val pose = chosen.hitPose
                    resolveHitCommon(pose.tx(), pose.ty(), pose.tz(), chosen.trackable is ARPlane, promise)
                }
            } catch (e: Exception) {
                promise.reject("E_HIT_TEST", e.message ?: "hitTest failed")
            }
        }
    }

    /** 优先取水平面内的命中，其次估算表面特征点 */
    private fun chooseHit(hits: List<ARHitResult>): ARHitResult? {
        var fallback: ARHitResult? = null
        for (hit in hits) {
            val trackable = hit.trackable
            if (trackable is ARPlane && trackable.trackingState == ARTrackable.TrackingState.TRACKING) {
                if (trackable.isPoseInPolygon(hit.hitPose)) {
                    return hit
                }
                if (fallback == null) {
                    fallback = hit
                }
            } else if (
                fallback == null &&
                trackable is ARPoint &&
                trackable.orientationMode == ARPoint.OrientationMode.ESTIMATED_SURFACE_NORMAL
            ) {
                fallback = hit
            }
        }
        return fallback
    }

    private fun postError(reason: String) {
        emitEvent("sessionError", Arguments.createMap().apply { putString("reason", reason) })
    }

    companion object {
        /** AR Engine 服务是否已就绪（isAREngineApkReady 为轻量同步查询） */
        fun isReady(context: Context): Boolean = try {
            AREnginesApk.isAREngineApkReady(context)
        } catch (e: Exception) {
            false
        }
    }
}

/** 华为 ARFrame → 通用相机背景帧接口 */
private class HuaweiBackgroundFrame(
    private val frame: ARFrame,
) : CameraBackgroundFrame {
    override fun hasDisplayGeometryChanged(): Boolean = frame.hasDisplayGeometryChanged()
    override fun transformDisplayUvCoords(input: FloatBuffer, output: FloatBuffer) {
        frame.transformDisplayUvCoords(input, output)
    }
}

private fun ARFrame.asBackgroundFrame(): CameraBackgroundFrame = HuaweiBackgroundFrame(this)
