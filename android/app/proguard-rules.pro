# El puente JavaScript debe conservar sus métodos anotados.
-keepclassmembers class com.grupomds.combusplus.WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Android Auto instancia estos componentes desde el manifiesto.
-keep class com.grupomds.combusplus.car.** { *; }

# Mantener los modelos que usa WorkManager por reflexión.
-keep class com.grupomds.combusplus.PriceWatchWorker { *; }
-dontwarn org.conscrypt.**
