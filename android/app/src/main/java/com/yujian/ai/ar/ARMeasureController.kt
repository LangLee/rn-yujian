package com.yujian.ai.ar

import android.view.View
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap

/**
 * AR 引擎控制器公共接口：ARCore 与华为 AR Engine 各有一份实现，
 * 由 ARMeasureView 容器按 engine prop 挂载。
 */
interface ARMeasureController {
    /** 相机背景 GL 视图（容器负责 addView） */
    val contentView: View

    /** 挂到窗口：启动/恢复会话 */
    fun onAttachedToWindow()

    /** 离开窗口：暂停会话释放相机 */
    fun onDetachedFromWindow()

    /** 前台可见性变化（Activity 后台/恢复） */
    fun onHostVisibilityChanged(visible: Boolean)

    /** dp 屏幕坐标 hitTest；resolve {x,y,z,plane}（米）或 null */
    fun hitTest(dpX: Float, dpY: Float, promise: Promise)

    /** 彻底释放（幂等） */
    fun release()
}

/** 控制器 → JS 事件回调（name: planeDetected / sessionError） */
typealias AREventEmitter = (name: String, params: WritableMap?) -> Unit
