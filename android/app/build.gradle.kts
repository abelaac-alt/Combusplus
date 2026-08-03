plugins {
    id("com.android.application")
}

val webAppUrl = providers.gradleProperty("COMBUSPLUS_WEB_URL").orElse("https://abelaac-alt.github.io/Combusplus/")
val functionsUrl = providers.gradleProperty("COMBUSPLUS_FUNCTIONS_URL").orElse("")
val publishableKey = providers.gradleProperty("COMBUSPLUS_PUBLISHABLE_KEY").orElse("")
val playIntegrityProjectNumber = providers.gradleProperty("PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER").orElse("0")
val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")
val keystorePassword = System.getenv("KEYSTORE_PASSWORD")
val keyAliasValue = System.getenv("KEY_ALIAS")
val keyPasswordValue = System.getenv("KEY_PASSWORD")
val generatedWebAssetsDir = layout.buildDirectory.dir("generated/combusplusWebAssets")

fun javaString(value: String): String = "\"" + value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"") + "\""

fun jsString(value: String): String = value
    .replace("\\", "\\\\")
    .replace("'", "\\'")
    .replace("\r", "")
    .replace("\n", "")

android {
    namespace = "com.grupomds.combusplus"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.grupomds.combusplus"
        minSdk = 26
        targetSdk = 36
        versionCode = 40
        versionName = "9.0.0"
        buildConfigField("String", "WEB_APP_URL", javaString(webAppUrl.get()))
        buildConfigField("String", "SUPABASE_FUNCTIONS_URL", javaString(functionsUrl.get()))
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", javaString(publishableKey.get()))
        buildConfigField("long", "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER", "${playIntegrityProjectNumber.get()}L")
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            // Solo se empaquetan los recursos generados durante la compilación.
            // Los archivos antiguos que existan en src/main/assets no entran en el APK/AAB.
            assets.setSrcDirs(listOf(generatedWebAssetsDir.get().asFile))
        }
    }

    signingConfigs {
        if (!keystoreFile.isNullOrBlank() && !keystorePassword.isNullOrBlank() && !keyAliasValue.isNullOrBlank() && !keyPasswordValue.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = keystorePassword
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingConfigs.findByName("release") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/DEPENDENCIES",
            "META-INF/LICENSE*",
            "META-INF/NOTICE*",
            "META-INF/*.kotlin_module"
        )
    }
}

dependencies {
    implementation("androidx.core:core:1.16.0")
    implementation("androidx.work:work-runtime:2.11.2")
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("androidx.car.app:app:1.7.0")
    implementation("androidx.car.app:app-projected:1.7.0")
    implementation("com.google.android.play:integrity:1.6.0")
}

val syncWebAssets by tasks.registering(Sync::class) {
    into(generatedWebAssetsDir)

    from("../../web") {
        into("www")
        exclude(
            "tests/**",
            "node_modules/**",
            "package.json",
            "package-lock.json",
            ".nojekyll",
            "config.js",
            "admin-analytics.html",
            "src/admin-analytics.js"
        )
    }

    doLast {
        val output = generatedWebAssetsDir.get().asFile
        val configFile = output.resolve("www/config.js")
        configFile.parentFile.mkdirs()
        configFile.writeText(
            """
            window.COMBUSPLUS_CONFIG = Object.freeze({
              version: '9.0.0',
              supabaseFunctionsUrl: '${jsString(functionsUrl.get())}',
              supabasePublishableKey: '${jsString(publishableKey.get())}',
              googleMapsKey: '',
              googleMapId: ''
            });
            """.trimIndent() + "\n",
            Charsets.UTF_8
        )

        val forbidden = listOf(
            output.resolve("www/admin-analytics.html"),
            output.resolve("www/src/admin-analytics.js")
        )
        if (forbidden.any { it.exists() }) {
            throw GradleException("El panel de administración no puede incluirse en Android.")
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}
