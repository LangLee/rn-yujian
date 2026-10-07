package com.yujian.ai.ar

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * ARCore 控制器：会话生命周期 + GL 相机背景 + 水平面检测 + hitTest。
 * 引导文案层（JS）与事件契约见 ARMeasureController。
 */
class ArCoreController(
    private val context: Context,
    private val emitEvent: AREventEmitter,
) : ARMeasureController {

    private val glView = GLSurfaceView(context)
    private val backgroundRenderer = BackgroundRenderer()
    private var session: Session? = null
    private var sessionResumed = false
    @Volatile
    private var latestFrame: Frame? = null
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
            } catch (e: CameraNotAvailableException) {
                postError("camera_unavailable")
                null
            } catch (e: IllegalStateException) {
                null
            }
            if (frame == null) {
                return
            }
            if (frame.timestamp == 0L) {
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
            val s = Session(context)
            val config = Config(s)
            // 鱼获摆在地面/台面：只检测水平面，省电且减少误命中
            config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
            config.lightEstimationMode = Config.LightEstimationMode.DISABLED
            s.configure(config)
            session = s
            resumeSession()
        } catch (e: UnavailableArcoreNotInstalledException) {
            postError("engine_not_installed")
        } catch (e: UnavailableApkTooOldException) {
            postError("engine_too_old")
        } catch (e: UnavailableSdkTooOldException) {
            postError("engine_too_old")
        } catch (e: UnavailableDeviceNotCompatibleException) {
            postError("unsupported_device")
        } catch (e: Exception) {
            postError("session_failed")
        }
    }

    private fun resumeSession() {
        val s = session ?: return
        if (sessionResumed) {
            return
        }
        try {
            s.resume()
            sessionResumed = true
        } catch (e: CameraNotAvailableException) {
            postError("camera_unavailable")
        } catch (e: Exception) {
            postError("resume_failed")
        }
    }

    private fun pauseSession() {
        runCatching { session?.pause() }
        sessionResumed = false
        latestFrame = null
    }

    private fun stopSession() {
        runCatching { session?.close() }
        session = null
        sessionResumed = false
        latestFrame = null
    }

    private fun maybeAnnouncePlane(s: Session) {
        if (planeAnnounced) {
            return
        }
        val tracking = s.getAllTrackables(Plane::class.java)
            .any { it.trackingState == TrackingState.TRACKING }
        if (tracking) {
            planeAnnounced = true
            emitEvent("planeDetected", null)
        }
    }

    override fun hitTest(dpX: Float, dpY: Float, promise: Promise) {
        val frame = latestFrame
        val s = session
        if (frame == null || s == null) {
            promise.reject("E_NO_FRAME", "AR 会话未就绪")
            return
        }
        glView.queueEvent {
            val event = MotionEvent.obtain(
                SystemClock.uptimeMillis(),
                SystemClock.uptimeMillis(),
                MotionEvent.ACTION_DOWN,
                dpX * density,
                dpY * density,
                0,
            )
            try {
                val chosen = chooseHit(frame.hitTest(event))
                resolveHit(chosen, promise)
            } catch (e: Exception) {
                promise.reject("E_HIT_TEST", e.message ?: "hitTest failed")
            } finally {
                event.recycle()
            }
        }
    }

    /** 优先取水平面内的命中，其次估算表面特征点 */
    private fun chooseHit(hits: List<HitResult>): HitResult? {
        var fallback: HitResult? = null
        for (hit in hits) {
            val trackable = hit.trackable
            if (trackable is Plane && trackable.trackingState == TrackingState.TRACKING) {
                if (trackable.isPoseInPolygon(hit.hitPose)) {
                    return hit
                }
                if (fallback == null) {
                    fallback = hit
                }
            } else if (
                fallback == null &&
                trackable is Point &&
                trackable.orientationMode == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL
            ) {
                fallback = hit
            }
        }
        return fallback
    }

    private fun postError(reason: String) {
        emitEvent("sessionError", Arguments.createMap().apply { putString("reason", reason) })
    }
}

/** ARCore Frame → 通用相机背景帧接口 */
private class ArCoreBackgroundFrame(
    private val frame: Frame,
) : CameraBackgroundFrame {
    override fun hasDisplayGeometryChanged(): Boolean = frame.hasDisplayGeometryChanged()
    override fun transformDisplayUvCoords(input: FloatBuffer, output: FloatBuffer) {
        frame.transformDisplayUvCoords(input, output)
    }
}

private fun Frame.asBackgroundFrame(): CameraBackgroundFrame = ArCoreBackgroundFrame(this)

/** 通用 hit 结果解析：世界坐标（米）+ 是否平面命中 */
internal fun resolveHitCommon(
    tx: Float,
    ty: Float,
    tz: Float,
    isPlane: Boolean,
    promise: Promise,
) {
    val map = Arguments.createMap()
    map.putDouble("x", tx.toDouble())
    map.putDouble("y", ty.toDouble())
    map.putDouble("z", tz.toDouble())
    map.putBoolean("plane", isPlane)
    promise.resolve(map)
}

private fun resolveHit(chosen: HitResult?, promise: Promise) {
    if (chosen == null) {
        promise.resolve(null)
        return
    }
    val translation = FloatArray(3)
    chosen.hitPose.getTranslation(translation, 0)
    resolveHitCommon(translation[0], translation[1], translation[2], chosen.trackable is Plane, promise)
}
