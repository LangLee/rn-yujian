package com.yujian.ai.rn

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.ar.core.ArCoreApk
import com.yujian.ai.ar.ARMeasureView

/**
 * AR 自动量尺模块：支持度探测 / ARCore 安装引导 / 屏幕坐标 hitTest。
 *
 * 相机会话由 ARMeasureView 的挂载/卸载管理，本模块只做无副作用的查询与
 * 对当前活跃视图的命中测试转发。
 */
class ARMeasureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "YujianARMeasure"
    }

    override fun getName(): String = NAME

    /** 'supported' 已就绪 | 'installable' 设备支持但 ARCore 未装/需更新 | 'unsupported' | 'unknown' 检测中 */
    @ReactMethod
    fun isARSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.resolve("unsupported")
            return
        }
        val availability = try {
            ArCoreApk.getInstance().checkAvailability(reactApplicationContext)
        } catch (e: Exception) {
            promise.resolve("unsupported")
            return
        }
        val result = when (availability) {
            ArCoreApk.Availability.SUPPORTED_INSTALLED -> "supported"
            ArCoreApk.Availability.SUPPORTED_NOT_INSTALLED,
            ArCoreApk.Availability.SUPPORTED_APK_TOO_OLD,
            -> "installable"
            ArCoreApk.Availability.UNSUPPORTED_DEVICE_NOT_CAPABLE -> "unsupported"
            else -> "unknown"
        }
        promise.resolve(result)
    }

    /**
     * 引导安装/更新 Google Play Services for AR（设备支持但未安装时）。
     * resolve(true) = 已就绪可进 AR；resolve(false) = 触发了商店安装流程，需稍后再试。
     */
    @ReactMethod
    fun requestARCoreInstall(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val result = ArCoreApk.getInstance().requestInstall(activity, true)
            promise.resolve(result == ArCoreApk.InstallStatus.INSTALLED)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** dp 屏幕坐标 → 世界坐标（米）；resolve(null) 表示未命中平面 */
    @ReactMethod
    fun hitTest(x: Double, y: Double, promise: Promise) {
        val view = ARMeasureView.activeView
        if (view == null) {
            promise.reject("E_NO_SESSION", "AR 会话未启动")
            return
        }
        view.hitTest(x.toFloat(), y.toFloat(), promise)
    }
}
