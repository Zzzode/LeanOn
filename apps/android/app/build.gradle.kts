import org.gradle.api.tasks.Copy

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.kapt)
}

// Lynx bundle produced by packages/pages via Rspeedy.
val lynxDistDir = rootProject.projectDir.resolve("../../packages/pages/dist")
val generatedLynxAssets = layout.buildDirectory.dir("generated/lynxAssets")

// Stage the built Lynx bundle into a generated assets source set.
val prepareLynxAssets by tasks.registering(Copy::class) {
  from(lynxDistDir) {
    include("*.lynx.bundle")
  }
  into(generatedLynxAssets)
}

android {
  namespace = "com.zzzode.leanon"
  compileSdk = 36

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

  sourceSets {
    getByName("main") {
      assets.srcDir(generatedLynxAssets)
    }
  }
}

// Ensure the bundle is staged before any variant merges its assets.
tasks.matching {
  it.name.startsWith("merge") && it.name.endsWith("Assets")
}.configureEach {
  dependsOn(prepareLynxAssets)
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.appcompat)
  implementation(libs.material)
  implementation(libs.androidx.fragment.ktx)
  implementation(libs.androidx.navigation.fragment.ktx)
  implementation(libs.androidx.navigation.ui.ktx)
  implementation(libs.androidx.activity.ktx)
  implementation(libs.androidx.work.runtime)
  implementation(libs.androidx.health.connect)

  implementation(libs.androidx.camera.core)
  implementation(libs.androidx.camera.camera2)
  implementation(libs.androidx.camera.lifecycle)
  implementation(libs.androidx.camera.view)
  implementation(libs.mlkit.barcode.scanning)
  // CameraX ListenableFuture APIs (explicit after the toolchain upgrade).
  implementation("com.google.guava:guava:33.4.0-android")

  implementation(libs.lynx)
  implementation(libs.lynx.jssdk)
  implementation(libs.lynx.trace)
  implementation(libs.primjs)
  kapt(libs.lynx.processor)

  testImplementation("junit:junit:4.13.2")
  // Real org.json for JVM unit tests (the Android jar ships an empty stub).
  testImplementation("org.json:json:20231013")
}
