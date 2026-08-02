plugins {
    id("com.android.application")
}

val webAppUrl = providers.gradleProperty("COMBUSPLUS_WEB_URL").orElse("https://abelaac-alt.github.io/Combusplus/")
val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")
val keystorePassword = System.getenv("KEYSTORE_PASSWORD")
val keyAliasValue = System.getenv("KEY_ALIAS")
val keyPasswordValue = System.getenv("KEY_PASSWORD")

android {
    namespace = "com.grupomds.combusplus"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.grupomds.combusplus"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "5.2.0"
        buildConfigField("String", "WEB_APP_URL", "\"${webAppUrl.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (!keystoreFile.isNullOrBlank() && !keystorePassword.isNullOrBlank() && !keyAliasValue.isNullOrBlank() && !keyPasswordValue.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = keystorePassword
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingConfigs.findByName("release") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.work:work-runtime:2.11.2")
}

val syncWebAssets by tasks.registering(Copy::class) {
    from("../../web")
    into("src/main/assets/www")
    exclude("tests/**", "package.json")
}
tasks.named("preBuild").configure { dependsOn(syncWebAssets) }
