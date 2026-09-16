package com.yujian.ai.ar

import android.annotation.SuppressLint
import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
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

import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * AR 自动量尺视图：ARCore 会话 + GL 相机背景 + 水平面检测 + hitTest。
 *
 * - 挂载即创建会话（水平面检测，关闭深度/光照估计省电），卸载即释放；
 *   与 VisionCamera 分时复用相机：本视图挂载前 JS 侧应停用 VisionCamera。
 * - 检测到首个 TRACKING 水平面后向 JS 发 onPlaneDetected 事件（一次）。
 * - JS 传入 dp 坐标 hitTest：在 GL 线程对最近一帧做命中测试，返回世界坐标（米）。
 * - 会话创建/相机失败等向 JS 发 onSessionError（带 reason code），由 JS 决定回落。
 */
@Suppress("ViewConstructor")
class ARMeasureView(
    themedContext: ThemedReactContext,
    private val reactContext: ThemedReactContext,
) : ViewGroup(themedContext) {

    companion object {
        /** 当前活跃实例；同一时刻只有一个 AR 量尺视图 */
        @Volatile
        var activeView: ARMeasureView? = null
            private set
    }

    private val glView: GLSurfaceView = GLSurfaceView(context)
    private val backgroundRenderer = BackgroundRenderer()
    private var session: Session? = null
    @Volatile
    private var latestFrame: Frame? = null
    private var textureBound = false
    private var planeAnnounced = false
    /** Session 没有查询暂停态的 API，自己跟踪 */
    private var sessionResumed = false
    private var surfaceWidth = 0
    private var surfaceHeight = 0
    private val density = resources.displayMetrics.density

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
                postError("session_paused")
                null
            }
            if (frame == null) {
                return
            }
            if (frame.timestamp == 0L) {
                return
            }
            latestFrame = frame
            runCatching { backgroundRenderer.draw(frame) }
            maybeAnnouncePlane(s)
        }
    }

    init {
        glView.setEGLContextClientVersion(2)
        glView.setRenderer(renderer)
        glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        glView.preserveEGLContextOnPause = true
        addView(
            glView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        activeView = this
        startSession()
        glView.onResume()
    }

    override fun onDetachedFromWindow() {
        glView.onPause()
        stopSession()
        if (activeView === this) {
            activeView = null
        }
        super.onDetachedFromWindow()
    }

    /** ViewManager 卸载视图时显式调用：停 GL、释放会话与相机（幂等） */
    fun release() {
        val action = {
            glView.onPause()
            stopSession()
            if (activeView === this) {
                activeView = null
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            reactContext.runOnUiQueueThread(action)
        }
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        // 页面被遮挡（Activity 后台）时暂停会话释放相机，回来再恢复
        if (isAttachedToWindow) {
            if (visibility == VISIBLE) {
                resumeSession()
                glView.onResume()
            } else {
                pauseSession()
                glView.onPause()
            }
        }
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
            postError("arcore_not_installed")
        } catch (e: UnavailableApkTooOldException) {
            postError("arcore_too_old")
        } catch (e: UnavailableSdkTooOldException) {
            postError("arcore_too_old")
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
            postEvent("planeDetected", null)
        }
    }

    /**
     * JS 线程调用：dp 屏幕坐标 → ARCore hitTest。
     * 返回世界坐标（米）{x, y, z, plane}；没命中 resolve(null)。
     */
    fun hitTest(dpX: Float, dpY: Float, promise: Promise) {
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
                val hits = frame.hitTest(event)
                val chosen = chooseHit(hits)
                if (chosen == null) {
                    promise.resolve(null)
                } else {
                    val translation = FloatArray(3)
                    chosen.hitPose.getTranslation(translation, 0)
                    val isPlane = chosen.trackable is Plane
                    val map = Arguments.createMap()
                    map.putDouble("x", translation[0].toDouble())
                    map.putDouble("y", translation[1].toDouble())
                    map.putDouble("z", translation[2].toDouble())
                    map.putBoolean("plane", isPlane)
                    promise.resolve(map)
                }
            } catch (e: Exception) {
                promise.reject("E_HIT_TEST", e.message ?: "hitTest failed")
            } finally {
                event.recycle()
            }
        }
    }

    /** 优先取水平面内的命中，其次估算表面特征点，最后任意命中 */
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
        postEvent("sessionError", Arguments.createMap().apply { putString("reason", reason) })
    }

    private fun postEvent(name: String, params: WritableMap?) {
        val data = params ?: Arguments.createMap()
        post {
            reactContext
                .getJSModule(RCTEventEmitter::class.java)
                .receiveEvent(id, name, data)
        }
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        glView.layout(0, 0, r - l, b - t)
    }
}
