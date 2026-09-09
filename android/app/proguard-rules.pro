# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ============================================
# 调试和错误追踪
# ============================================
# 保留行号信息，便于调试 Release 版本的崩溃
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# 保留异常信息
-keepattributes Exceptions

# 不优化某些可能导致问题的代码
-dontoptimize
-dontpreverify

# React Native 优化规则
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# 保留所有错误日志（即使在 Release 版本）
# 注释掉日志移除规则，以便调试
# -assumenosideeffects class android.util.Log {
#     public static *** d(...);
#     public static *** v(...);
#     public static *** i(...);
# }

# ============================================
# Supabase 相关规则
# ============================================
-keep class io.supabase.** { *; }
-dontwarn io.supabase.**
-keepclassmembers class io.supabase.** { *; }

# Supabase 使用的 Kotlin 协程
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.**

# Ktor (Supabase 的网络库)
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-keepclassmembers class io.ktor.** { *; }
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

# OkHttp (Supabase 使用的网络库)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Retrofit (如果 Supabase 使用)
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Gson (JSON 序列化)
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# 保留所有的数据模型类（防止序列化问题）
-keep class com.basetemplate.** { *; }

# ============================================
# JavaScript Bridge 和 JSON 序列化
# ============================================
# 保留所有通过 JavaScript Bridge 传递的类和方法
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keep @com.facebook.react.bridge.ReactModule class * { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# 保留所有 JSON 相关的字段和方法（防止序列化失败）
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keepclassmembers class * {
    public <init>(...);
}

# 保留所有可能通过反射访问的类
-keepclassmembers class * {
    public <methods>;
    public <fields>;
}

# ============================================
# 关键：保护 JavaScript 对象属性名不被混淆
# ============================================
# 这是 Release 版本保存失败的关键修复
# 防止对象展开运算符 (...obj) 中的属性名被混淆
-keepclassmembers class * {
    *** user_id;
    *** type;
    *** name;
    *** symbol;
    *** institution;
    *** current_value;
    *** initial_value;
    *** status;
    *** maturity_date;
    *** purchase_date;
    *** image_url;
    *** notes;
    *** created_at;
    *** updated_at;
    *** gain;
    *** gain_percentage;
}

# 保护所有带下划线的字段名（数据库字段命名约定）
-keepclassmembers class * {
    *** *_*;
}

# ============================================
# AsyncStorage (Supabase 会话存储)
# ============================================
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.react.asyncstorage.** { *; }
-keepclassmembers class com.reactnativecommunity.asyncstorage.** { *; }

# ============================================
# URL Polyfill (Supabase 需要)
# ============================================
-keep class com.facebook.react.modules.network.** { *; }
-keep class com.facebook.react.modules.websocket.** { *; }
-keepclassmembers class com.facebook.react.modules.network.** { *; }
-keepclassmembers class com.facebook.react.modules.websocket.** { *; }

# ============================================
# Fetch API 和 WebSocket (Supabase 依赖)
# ============================================
-keep class com.facebook.react.modules.blob.** { *; }
-keep class com.facebook.react.modules.fresco.** { *; }
-keepclassmembers class com.facebook.react.modules.blob.** { *; }

# ============================================
# React Native Config (环境变量)
# ============================================
-keep class com.lugg.ReactNativeConfig.** { *; }
-keep class com.lugg.** { *; }
-keepclassmembers class com.lugg.ReactNativeConfig.ReactNativeConfigModule {
    *;
}
-keepclassmembers class com.lugg.** { *; }

# 保护环境变量不被混淆
-keep class **.BuildConfig { *; }
-keepclassmembers class **.BuildConfig { *; }

# 保护 react-native-config 的 native 方法
-keepclasseswithmembers class com.lugg.ReactNativeConfig.ReactNativeConfigModule {
    public <methods>;
}

# 保护所有可能通过 JNI 调用的方法
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# ============================================
# React Navigation
# ============================================
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# ============================================
# Vector Icons
# ============================================
-keep class com.oblador.vectoricons.** { *; }

# ============================================
# NetInfo
# ============================================
-keep class com.reactnativecommunity.netinfo.** { *; }

# ============================================
# 通用规则
# ============================================
# 保留所有的 native 方法
-keepclasseswithmembernames class * {
    native <methods>;
}

# 保留枚举类
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# 保留 Parcelable
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# 保留 Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# JavaScript 接口
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 保留注解
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes InnerClasses

# ============================================
# 端侧推理（拍照识鱼）
# ============================================
# ONNX Runtime 的 native 层通过 JNI 按类名/方法名回调 Java 侧，
# 被混淆改名后首次推理即抛 NoSuchMethod / ClassNotFoundException 导致闪退。
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# TensorFlow Lite（fish_classifier.tflite 的解释器与委托）。
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-dontwarn org.tensorflow.lite.**

# 识鱼原生模块自身（RN 桥接与 JSON 契约类）。
-keep class com.yujian.ai.** { *; }