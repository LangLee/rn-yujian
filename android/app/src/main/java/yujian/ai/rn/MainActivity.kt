package com.yujian.ai.rn

import android.graphics.Color
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used for scheduling
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "yujianai"

  /**
   * Edge-to-edge（Core UI V1 全出血背景）：
   * Android 15+（targetSdk 35）默认强制；老系统需要显式关闭 DecorFitsSystemWindows
   * 并透明化系统栏，否则导航栏区域露出白色窗口背景，MorningLakeScene 画不到屏幕底部。
   * 底部安全距离由 JS 侧 react-native-safe-area-context（useSafeAreaInsets）统一提供。
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flag [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
