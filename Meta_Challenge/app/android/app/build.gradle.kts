plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.junction2026.lens"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.junction2026.lens"
        minSdk = 31
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
        // Developer Mode: attestation is not used, so both are "0".
        manifestPlaceholders["mwdat_application_id"] = "0"
        manifestPlaceholders["mwdat_client_token"] = "0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/lensAssets"))
    kotlin {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
    }
}

// Bundle the shared library JSON for offline cards; no duplicate copy lives in git.
val copyLensAssets by tasks.registering(Copy::class) {
    from(rootProject.layout.projectDirectory.file("../shared/objects.json"))
    into(layout.buildDirectory.dir("generated/lensAssets"))
}
tasks.named("preBuild") { dependsOn(copyLensAssets) }

dependencies {
    val mwdat = "1.0.1"
    implementation("com.meta.wearable:mwdat-core:$mwdat")
    implementation("com.meta.wearable:mwdat-camera:$mwdat")
    implementation("com.meta.wearable:mwdat-display:$mwdat")
    implementation("com.meta.wearable:mwdat-inputs:$mwdat")
    implementation("com.meta.wearable:mwdat-mockdevice:$mwdat")
    implementation("com.meta.wearable:mwdat-speech:$mwdat") // session.addSpeech(): spoken follow-up questions
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
