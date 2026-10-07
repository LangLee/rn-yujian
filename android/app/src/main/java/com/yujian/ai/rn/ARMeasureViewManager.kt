package com.yujian.ai.rn

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.yujian.ai.ar.ARMeasureView

/**
 * YujianARMeasureView 的 legacy ViewManager（经新架构 interop 层暴露给 JS）。
 * engine prop 决定容器内挂载的引擎控制器（arcore / huawei）。
 * 事件经 RCTEventEmitter 发出，registrationName 映射为 JS 侧 onXxx 回调 props。
 */
class ARMeasureViewManager : SimpleViewManager<ARMeasureView>() {

    companion object {
        const val REACT_CLASS = "YujianARMeasureView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): ARMeasureView =
        ARMeasureView(reactContext, reactContext)

    override fun onDropViewInstance(view: ARMeasureView) {
        // 新架构 interop 下卸载不一定触发 onDetachedFromWindow，显式释放会话与相机
        view.release()
        super.onDropViewInstance(view)
    }

    @ReactProp(name = "engine")
    fun setEngine(view: ARMeasureView, engine: String?) {
        view.setEngine(engine)
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
        mutableMapOf(
            "planeDetected" to mapOf("registrationName" to "onPlaneDetected"),
            "sessionError" to mapOf("registrationName" to "onSessionError"),
        )
}
