package com.yujian.ai.rn

import android.annotation.SuppressLint
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * 定位模块：系统定位服务状态 / 一次性定位 / 最后已知位置。
 *
 * 只用框架 LocationManager（GPS / NETWORK / PASSIVE），不依赖 GMS，
 * 与 ARCore 的无 GMS 降级策略保持一致。
 * 运行时权限由 JS 侧 PermissionsAndroid 负责，本模块在权限缺失时
 * 以 E_PERMISSION 拒绝，不做二次申请。
 */
class LocationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "YujianLocation"
        /** 最后已知位置可接受的最大年龄（拍照等待期兜底，过旧视为无效） */
        private const val LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000L
    }

    override fun getName(): String = NAME

    private val locationManager: LocationManager?
        get() = try {
            reactApplicationContext.getSystemService(LocationManager::class.java)
        } catch (e: Exception) {
            null
        }

    /** 系统定位服务（GPS / 网络 / 被动）是否已开启 */
    @ReactMethod
    fun isLocationServiceEnabled(promise: Promise) {
        val lm = locationManager
        if (lm == null) {
            promise.resolve(false)
            return
        }
        promise.resolve(isAnyProviderEnabled(lm))
    }

    /** 最后已知位置（可能为 null 或过旧），用于快速兜底展示 */
    @ReactMethod
    fun getLastKnownPosition(promise: Promise) {
        if (!hasLocationPermission()) {
            promise.reject("E_PERMISSION", "未授予定位权限")
            return
        }
        val lm = locationManager
        if (lm == null) {
            promise.resolve(null)
            return
        }
        promise.resolve(lastKnownWithin(lm)?.toMap())
    }

    /**
     * 一次性定位：同时监听 GPS / NETWORK，取第一个有效定位；
     * timeoutMs 内无定位时回落最后已知位置，仍无则 E_NO_FIX。
     */
    @ReactMethod
    fun getCurrentPosition(timeoutMs: Double, promise: Promise) {
        if (!hasLocationPermission()) {
            promise.reject("E_PERMISSION", "未授予定位权限")
            return
        }
        val lm = locationManager
        if (lm == null) {
            promise.reject("E_UNAVAILABLE", "定位服务不可用")
            return
        }
        if (!isAnyProviderEnabled(lm)) {
            promise.reject("E_SERVICE_OFF", "系统定位服务已关闭")
            return
        }

        val timeout = if (timeoutMs > 0) timeoutMs.toLong() else 10_000L
        val mainHandler = Handler(Looper.getMainLooper())
        var settled = false
        var listener: LocationListener? = null
        var timeoutRunnable: Runnable? = null

        val settle: (Location?) -> Unit = { location ->
            synchronized(this) {
                if (settled) {
                    return@synchronized
                }
                settled = true
            }
            mainHandler.post {
                listener?.let {
                    try {
                        lm.removeUpdates(it)
                    } catch (_: Exception) {
                    }
                }
                timeoutRunnable?.let(mainHandler::removeCallbacks)
                if (location != null) {
                    promise.resolve(location.toMap())
                } else {
                    promise.reject("E_NO_FIX", "暂无可用定位")
                }
            }
        }

        listener = LocationListener { location -> settle(location) }

        try {
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { lm.allProviders.contains(it) && lm.isProviderEnabled(it) }
            if (providers.isEmpty()) {
                promise.reject("E_SERVICE_OFF", "系统定位服务已关闭")
                return
            }
            // 钓点级精度（50m）已足够识鱼场景，避免要求高精度导致室内长时间无回调
            for (provider in providers) {
                lm.requestLocationUpdates(provider, 0L, 50f, listener!!, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            promise.reject("E_PERMISSION", "未授予定位权限")
            return
        } catch (e: Exception) {
            promise.reject("E_UNAVAILABLE", "定位服务不可用")
            return
        }

        // 超时：先试最后已知位置，再报 E_NO_FIX
        timeoutRunnable = Runnable { settle(lastKnownWithin(lm)) }
        mainHandler.postDelayed(timeoutRunnable, timeout)
    }

    private fun hasLocationPermission(): Boolean {
        val pm = reactApplicationContext.packageManager
        val packageName = reactApplicationContext.packageName
        val granted = android.content.pm.PackageManager.PERMISSION_GRANTED
        val fine = pm.checkPermission("android.permission.ACCESS_FINE_LOCATION", packageName) == granted
        val coarse = pm.checkPermission("android.permission.ACCESS_COARSE_LOCATION", packageName) == granted
        return fine || coarse
    }

    private fun isAnyProviderEnabled(lm: LocationManager): Boolean = try {
        lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)
    } catch (e: Exception) {
        false
    }

    @SuppressLint("MissingPermission")
    private fun lastKnownWithin(lm: LocationManager): Location? = try {
        lm.allProviders
            .mapNotNull { provider ->
                try {
                    lm.getLastKnownLocation(provider)
                } catch (e: SecurityException) {
                    null
                }
            }
            .filter { System.currentTimeMillis() - it.time <= LAST_KNOWN_MAX_AGE_MS }
            .maxByOrNull { it.time }
    } catch (e: Exception) {
        null
    }
}

private fun Location.toMap(): WritableMap {
    val map = Arguments.createMap()
    map.putDouble("latitude", latitude)
    map.putDouble("longitude", longitude)
    if (hasAccuracy()) {
        map.putDouble("accuracy", accuracy.toDouble())
    }
    map.putDouble("timestamp", time.toDouble())
    return map
}
