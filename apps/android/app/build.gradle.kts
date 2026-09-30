plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.kapt)
}

android {
  namespace = "com.zzzode.leanon"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.zzzode.leanon"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
  buildFeatures {
    buildConfig = true
  }
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.appcompat)
  implementation(libs.androidx.activity.ktx)
  implementation(libs.androidx.work.runtime)

  implementation(libs.lynx)
  implementation(libs.lynx.jssdk)
  implementation(libs.lynx.trace)
  implementation(libs.primjs)
  kapt(libs.lynx.processor)
}
