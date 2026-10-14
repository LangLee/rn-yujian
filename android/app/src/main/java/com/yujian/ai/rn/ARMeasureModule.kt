package com.yujian.ai.rn

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.ar.core.ArCoreApk
import com.yujian.ai.ar.ARDeviceCompat
import com.yujian.ai.ar.ARMeasureView
import com.yujian.ai.ar.HuaweiARController

/**
 * AR 自动量尺模块：双引擎支持度探测 / 安装引导 / 屏幕坐标 hitTest。
 *
 * 引擎优先级：ARCore（GMS 设备）→ 华为 AR Engine（HMS 设备：华为/荣耀）。
 * isARSupported 返回组合码 'level:engine'：
 *   supported:arcore / supported:huawei / installable:arcore / installable:huawei
 *   / unsupported / unknown（检测中）
 *
 * 相机会话由 ARMeasureView 的挂载/卸载管理，本模块只做无副作用查询与转发。
 */
class ARMeasureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "YujianARMeasure"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isARSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.resolve("unsupported")
            return
        }

        // 1) ARCore
        val arcoreAvailability = try {
            ArCoreApk.getInstance().checkAvailability(reactApplicationContext)
        } catch (e: Exception) {
            null
        }
        if (arcoreAvailability == ArCoreApk.Availability.SUPPORTED_INSTALLED) {
            promise.resolve("supported:arcore")
            return
        }

        // 2) 华为 AR Engine（checkAvailability 为同步枚举，UNKNOWN 时也先看华为）
        val huaweiAvailability = try {
            com.huawei.hiar.AREnginesApk.checkAvailability(reactApplicationContext)
        } catch (e: Exception) {
            null
        }
        // 新鸿蒙（NEXT / 新出厂 4.2+）不再提供 Android 版 AR Engine 服务，
        // checkAvailability 可能误报 SUPPORTED_INSTALLED：以 isAREngineApkReady
        // 实际服务状态双确认，矛盾时视为不可用，由 JS 直接回落手动量尺。
        val huaweiServiceReady = HuaweiARController.isReady(reactApplicationContext)
        if (huaweiAvailability == com.huawei.hiar.AREnginesApk.ARAvailability.SUPPORTED_INSTALLED &&
            huaweiServiceReady
        ) {
            promise.resolve("supported:huawei")
            return
        }

        // 3) 可安装的优先级：ARCore 可装 → 华为可装 → 都在检测 → 不支持
        if (arcoreAvailability == ArCoreApk.Availability.SUPPORTED_NOT_INSTALLED ||
            arcoreAvailability == ArCoreApk.Availability.SUPPORTED_APK_TOO_OLD
        ) {
            promise.resolve("installable:arcore")
            return
        }
        // HarmonyOS NEXT（5+）上 Android 版服务装不上，引导安装只会失败，直接跳过
        val huaweiInstallable = !ARDeviceCompat.shouldBlockHuaweiArInstall() && (
            huaweiAvailability == com.huawei.hiar.AREnginesApk.ARAvailability.SUPPORTED_NOT_INSTALLED ||
                huaweiAvailability == com.huawei.hiar.AREnginesApk.ARAvailability.SUPPORTED_APK_TOO_OLD
            )
        if (huaweiInstallable) {
            promise.resolve("installable:huawei")
            return
        }
        if (arcoreAvailability == null && huaweiAvailability == null) {
            promise.resolve("unsupported")
            return
        }
        val stillChecking =
            arcoreAvailability == ArCoreApk.Availability.UNKNOWN_CHECKING ||
                huaweiAvailability == com.huawei.hiar.AREnginesApk.ARAvailability.UNKNOWN_CHECKING
        promise.resolve(if (stillChecking) "unknown" else "unsupported")
    }

    /**
     * 引导安装/更新对应引擎（ARCore → Play；AR Engine → 应用市场/系统组件）。
     * resolve(true) = 已就绪；resolve(false) = 触发了安装流程需稍后再试。
     */
    @ReactMethod
    fun requestARCoreInstall(engine: String?, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            if (engine == "huawei") {
                // HarmonyOS NEXT（5+）上 Android 版 AR Engine 服务不可安装：短路，
                // 让 JS 立即回落手动量尺，避免无效的应用市场跳转
                if (ARDeviceCompat.shouldBlockHuaweiArInstall()) {
                    promise.resolve(false)
                    return
                }
                val result = com.huawei.hiar.AREnginesApk.requestInstall(activity, true)
                promise.resolve(result == com.huawei.hiar.AREnginesApk.ARInstallStatus.INSTALLED)
            } else {
                val result = ArCoreApk.getInstance().requestInstall(activity, true)
                promise.resolve(result == ArCoreApk.InstallStatus.INSTALLED)
            }
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
