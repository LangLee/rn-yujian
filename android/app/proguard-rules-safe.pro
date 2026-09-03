# 安全的 ProGuard 配置 - 用于调试 Release 版本问题
# 这个配置禁用了大部分优化，确保功能正常

# ============================================
# 基础配置 - 禁用优化
# ============================================
-dontoptimize
-dontobfuscate
-dontpreverify
-dontshrink

# 保留所有信息用于调试
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# ============================================
# React Native 核心
# ============================================
-keep class com.facebook.** { *; }
-keep class com.swmansion.** { *; }
-keep class com.reactnativecommunity.** { *; }

# ============================================
# Supabase 和依赖
# ============================================
-keep class io.supabase.** { *; }
-keep class io.ktor.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class kotlinx.** { *; }
-keep class kotlin.** { *; }

# ============================================
# JSON 和序列化
# ============================================
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.** { *; }

# ============================================
# 应用代码
# ============================================
-keep class com.basetemplate.** { *; }
-keep class com.lugg.** { *; }

# ============================================
# 第三方库
# ============================================
-keep class com.oblador.** { *; }
-keep class com.th3rdwave.** { *; }

# ============================================
# 通用保护
# ============================================
-keepclassmembers class * {
    native <methods>;
}

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ============================================
# 忽略警告
# ============================================
-dontwarn io.supabase.**
-dontwarn io.ktor.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.**
-dontwarn kotlin.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
