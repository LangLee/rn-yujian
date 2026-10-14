package com.yujian.ai.ar

import android.os.Build

/**
 * AR 引擎设备/系统兼容性判定。
 *
 * 背景：华为 Android 版 AR Engine（com.huawei.hms:arenginesdk）依赖系统侧
 * "AR Engine 服务"组件；HarmonyOS NEXT 及新出厂 HarmonyOS 4.2+ 机型已不再
 * 提供该 Android 服务（新系统仅支持鸿蒙原生 ArkTS 版 AREngine Kit）。
 * 此时 AREnginesApk.checkAvailability 仍可能误报 SUPPORTED_INSTALLED /
 * SUPPORTED_NOT_INSTALLED，按误报走 AR 会话或安装引导必然失败，
 * 因此探测时需结合鸿蒙系统版本与 isAREngineApkReady 实际状态修正结论。
 */
object ARDeviceCompat {

    /** 鸿蒙系统属性（HarmonyOS 2/3/4/5+ 均携带，值形如 "4.2.0"） */
    private const val PROP_HARMONY_VERSION = "ro.build.version.harmonyos"

    private fun systemProperty(key: String): String? = try {
        Class.forName("android.os.SystemProperties")
            .getMethod("get", String::class.java)
            .invoke(null, key) as? String
    } catch (e: Throwable) {
        null
    }

    /**
     * 鸿蒙大版本号；null = 非 HarmonyOS（EMUI / MagicOS / 原生 Android）。
     * 属性缺失时以 DISPLAY 兜底识别（无法取版本按 0 处理，只影响 >=5 硬拦截）。
     */
    fun harmonyOsMajorVersion(): Int? {
        systemProperty(PROP_HARMONY_VERSION)?.substringBefore('.')
            ?.toIntOrNull()?.let { return it }
        val display = Build.DISPLAY ?: Build.VERSION.INCREMENTAL ?: ""
        return if (display.contains("HarmonyOS", ignoreCase = true) ||
            display.contains("Harmony", ignoreCase = true)
        ) {
            0
        } else {
            null
        }
    }

    /**
     * 是否应禁止华为 AR Engine 的安装引导。
     * HarmonyOS NEXT（5+，含兼容层装 APK 的场景）上 Android 版服务无法安装，
     * 引导只会跳到无效的应用市场页面；直接回落手动量尺。
     */
    fun shouldBlockHuaweiArInstall(): Boolean = (harmonyOsMajorVersion() ?: -1) >= 5
}
