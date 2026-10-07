package com.yujian.ai.ar

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

/**
 * AR 自动量尺视图（容器）。
 *
 * 按 JS 传入的 engine prop（'arcore' | 'huawei'）挂载对应引擎控制器：
 *  - arcore  → ArCoreController（GMS 设备）
 *  - huawei → HuaweiARController（HMS 设备：华为 / 荣耀）
 *
 * 容器负责：GL 背景视图挂载、窗口生命周期转发（attach/detach/可见性）、
 * hitTest 转发、事件（planeDetected / sessionError）发往 JS。
 * 与 VisionCamera 分时复用相机：本视图挂载前 JS 侧应停用 VisionCamera。
 */
@Suppress("ViewConstructor")
class ARMeasureView(
    themedContext: ThemedReactContext,
    private val reactContext: ThemedReactContext,
) : FrameLayout(themedContext) {

    companion object {
        /** 当前活跃实例；同一时刻只有一个 AR 量尺视图 */
        @Volatile
        var activeView: ARMeasureView? = null
            private set
    }

    private var controller: ARMeasureController? = null
    private var released = false

    /** ViewManager 的 engine prop：创建并挂载对应引擎控制器（只生效一次） */
    fun setEngine(engine: String?) {
        if (controller != null || released || engine == null) {
            return
        }
        val created: ARMeasureController = if (engine == "huawei") {
            HuaweiARController(context, ::emitEvent)
        } else {
            ArCoreController(context, ::emitEvent)
        }
        controller = created
        addView(
            created.contentView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        if (isAttachedToWindow) {
            created.onAttachedToWindow()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        activeView = this
        controller?.onAttachedToWindow()
    }

    override fun onDetachedFromWindow() {
        controller?.onDetachedFromWindow()
        if (activeView === this) {
            activeView = null
        }
        super.onDetachedFromWindow()
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        // 页面被遮挡（Activity 后台）时暂停会话释放相机，回来再恢复
        if (isAttachedToWindow) {
            controller?.onHostVisibilityChanged(visibility == VISIBLE)
        }
    }

    /** JS 线程调用：dp 屏幕坐标 → 引擎 hitTest；resolve {x,y,z,plane}（米）或 null */
    fun hitTest(dpX: Float, dpY: Float, promise: Promise) {
        val c = controller
        if (c == null) {
            promise.reject("E_NO_SESSION", "AR 会话未启动")
            return
        }
        c.hitTest(dpX, dpY, promise)
    }

    /** ViewManager 卸载视图时显式调用：停 GL、释放会话与相机（幂等） */
    fun release() {
        val action = {
            released = true
            controller?.release()
            controller = null
            removeAllViews()
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

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val child: View? = controller?.contentView
        child?.layout(0, 0, right - left, bottom - top)
    }

    private fun emitEvent(name: String, params: WritableMap?) {
        val data = params ?: Arguments.createMap()
        val emit = {
            reactContext
                .getJSModule(RCTEventEmitter::class.java)
                .receiveEvent(id, name, data)
        }
        // 控制器可能在 GL 线程回调（onDrawFrame），事件必须回主线程发
        if (Looper.myLooper() == Looper.getMainLooper()) {
            emit()
        } else {
            reactContext.runOnUiQueueThread(emit)
        }
    }
}
