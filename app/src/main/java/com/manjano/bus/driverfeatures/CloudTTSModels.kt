package com.manjano.bus.driverfeatures

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class TTSRequest(
    val input: TTSInput,
    val voice: TTSVoice,
    val audioConfig: TTSAudioConfig
)

@JsonClass(generateAdapter = true)
data class TTSInput(val text: String)

@JsonClass(generateAdapter = true)
data class TTSVoice(
    val languageCode: String = "sw-KE",
    val name: String = "sw-KE-Wavenet-B", // Professional Male Kenyan Voice
    val ssmlGender: String = "MALE"
)

@JsonClass(generateAdapter = true)
data class TTSAudioConfig(
    val audioEncoding: String = "MP3",
    val pitch: Double = -2.0,
    val speakingRate: Double = 0.9
)

@JsonClass(generateAdapter = true)
data class TTSResponse(val audioContent: String)