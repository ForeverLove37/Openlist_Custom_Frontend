plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val driveUrl = providers.gradleProperty("driveUrl").orElse("https://drive.erailab.com").get()
val releaseVersion = providers.gradleProperty("releaseVersion").orElse("0.1.0").get()
val releaseCode = providers.gradleProperty("releaseCode").orElse("1").get().toInt()
val releaseStoreFile = System.getenv("ANDROID_KEYSTORE_PATH")
val releaseStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
val releaseKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")

android {
    namespace = "com.foreverlove37.openlistdrive"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.foreverlove37.openlistdrive"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseCode
        versionName = releaseVersion
        buildConfigField("String", "DRIVE_URL", "\"$driveUrl\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (releaseStoreFile != null && releaseStorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null) {
            create("remoteRelease") {
                storeFile = file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("remoteRelease")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
}
