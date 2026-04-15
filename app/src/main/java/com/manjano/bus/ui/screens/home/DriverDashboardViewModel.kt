package com.manjano.bus.ui.screens.home

import android.annotation.SuppressLint
import androidx.lifecycle.ViewModel
import com.google.android.gms.location.*
import com.google.firebase.database.FirebaseDatabase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.StateFlow
import com.manjano.bus.driverfeatures.TTSRequest
import com.manjano.bus.driverfeatures.TTSResponse
import com.manjano.bus.driverfeatures.TTSInput
import com.manjano.bus.driverfeatures.TTSVoice
import com.manjano.bus.driverfeatures.TTSAudioConfig
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.google.firebase.functions.FirebaseFunctions

data class Student(
    val childId: String = "",
    val displayName: String = "",
    val parentPhoneNumber: String = "",
    val parentName: String = "",
    val status: String = "Waiting",
    val active: Boolean = true,
    val eta: String = "",
    val photoUrl: String = "",
    val fingerprintId: Int? = null,
    val pickUpLat: Double = 0.0,
    val pickUpLng: Double = 0.0
)

@HiltViewModel
class DriverDashboardViewModel @Inject constructor(
    private val fusedLocationClient: FusedLocationProviderClient,
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: android.content.Context
) : ViewModel() {

    private val database = FirebaseDatabase.getInstance().reference
    private var currentBusId: String = "bus_001"
    private var tts: android.speech.tts.TextToSpeech? = null
    private val firestore = FirebaseFirestore.getInstance()

    // Memory to ensure we only notify parents once per student per trip
    private val notifiedStudents = mutableSetOf<String>()

    init {
        android.util.Log.d("TTS_DEBUG", "Initializing TTS...")
        tts = android.speech.tts.TextToSpeech(context) { status ->
            if (status == android.speech.tts.TextToSpeech.SUCCESS) {
                // 1. Force Swahili Kenya Locale
                val localeKe = java.util.Locale("sw", "KE")
                val result = tts?.setLanguage(localeKe)

                if (result == android.speech.tts.TextToSpeech.LANG_MISSING_DATA ||
                    result == android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED) {
                    android.util.Log.e("TTS_DEBUG", "Swahili Kenya not supported or missing data")
                }

                // 2. Set the "Manly" tone
                tts?.setSpeechRate(0.85f) // Slightly faster than before but still calm
                tts?.setPitch(0.8f)      // Deeper voice

                // 3. Find a voice that is EXPLICITLY Swahili
                val voices = tts?.voices
                val swahiliMaleVoice = voices?.firstOrNull { voice ->
                    val name = voice.name.lowercase()
                    voice.locale.language == "sw" &&
                            (name.contains("male") || name.contains("network#2") || name.contains("low-quality#2"))
                }

                swahiliMaleVoice?.let {
                    tts?.setVoice(it)
                    android.util.Log.d("TTS_DEBUG", "Selected Voice: ${it.name}")
                }

                android.util.Log.d("TTS_DEBUG", "TTS Initialization Successful!")
            } else {
                android.util.Log.e("TTS_DEBUG", "TTS Initialization Failed: $status")
            }
        }
        fetchAssignedStudents()
    }


    private val _mobileNumberError = MutableStateFlow<String?>(null)
    val mobileNumberError: StateFlow<String?> = _mobileNumberError.asStateFlow()

    private val _driverFirstName = MutableStateFlow("")
    val driverFirstName: StateFlow<String> = _driverFirstName

    private val _alreadyRegisteredError = MutableStateFlow<String?>(null)
    val alreadyRegisteredError: StateFlow<String?> = _alreadyRegisteredError.asStateFlow()

    private val _isDriverActive = MutableStateFlow<Boolean?>(null)
    val isDriverActive: StateFlow<Boolean?> = _isDriverActive.asStateFlow()

    private var activeStatusListener: com.google.firebase.firestore.ListenerRegistration? = null

    var loggedInDriverPhoneNumber: String? = null
        private set

    fun setLoggedInDriverPhoneNumber(phone: String) {
        loggedInDriverPhoneNumber = if (phone.startsWith("7")) "0$phone" else phone
    }

    fun fetchDriverNameRealtime(phoneNumber: String) {
        var normalizedPhone = phoneNumber.trim().replace("[^+0-9]".toRegex(), "")

        when {
            normalizedPhone.length == 9 && normalizedPhone.startsWith("7") -> normalizedPhone = "0$normalizedPhone"
            normalizedPhone.length == 9 && normalizedPhone.startsWith("1") -> normalizedPhone = "0$normalizedPhone"
            normalizedPhone.startsWith("254") && normalizedPhone.length == 12 -> normalizedPhone = "0" + normalizedPhone.substring(3)
            normalizedPhone.startsWith("+254") && normalizedPhone.length == 13 -> normalizedPhone = "0" + normalizedPhone.substring(4)
        }

        firestore.collection("drivers")
            .whereEqualTo("mobileNumber", normalizedPhone)
            .addSnapshotListener { snapshots, error ->
                if (error != null) return@addSnapshotListener
                if (snapshots == null || snapshots.isEmpty) return@addSnapshotListener

                val doc = snapshots.documents.first()
                val fullName = doc.getString("name") ?: ""
                val firstName = fullName.trim().split("\\s+".toRegex()).firstOrNull() ?: fullName.trim()

                _driverFirstName.value = firstName
                monitorDriverActiveStatus(doc.id)
            }
    }

    fun monitorDriverActiveStatus(driverDocumentId: String) {
        activeStatusListener?.remove()
        activeStatusListener = firestore.collection("drivers")
            .document(driverDocumentId)
            .addSnapshotListener { snapshot, error ->
                if (error == null && snapshot != null && snapshot.exists()) {
                    _isDriverActive.value = snapshot.getBoolean("active") ?: true
                }
            }
    }

    fun updateLastLogin(phoneNumber: String) {
        FirebaseFirestore.getInstance().collection("drivers")
            .document(phoneNumber)
            .update("lastLogin", System.currentTimeMillis())
    }

    private val _isTracking = MutableStateFlow(false)
    val isTracking = _isTracking.asStateFlow()

    private val _studentList = MutableStateFlow<List<Student>>(emptyList())
    val studentList = _studentList.asStateFlow()

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            // This tells us the GPS hardware is actually sending data to the app
            android.util.Log.d("GPS_DEBUG", "--- Location Update Received ---")

            result.lastLocation?.let { location ->
                // This shows us EXACTLY where the phone thinks it is
                android.util.Log.d("GPS_DEBUG", "Bus Coordinates: ${location.latitude}, ${location.longitude}")

                val updates = mapOf(
                    "lat" to location.latitude,
                    "lng" to location.longitude,
                    "timestamp" to System.currentTimeMillis()
                )
                database.child("busLocations").child(currentBusId).setValue(updates)

                // Now run the distance math
                checkProximityAndNotify(location.latitude, location.longitude)
            } ?: run {
                // If this shows up, the phone is failing to get a satellite lock
                android.util.Log.e("GPS_DEBUG", "Location is NULL! Move closer to a window.")
            }
        }
    }

    private fun checkProximityAndNotify(busLat: Double, busLng: Double) {
        val students = _studentList.value
        if (students.isEmpty()) {
            android.util.Log.d("PROXIMITY", "Check skipped: Student list is empty.")
            return
        }

        students.forEach { student ->
            // 1. Create the matching key (same logic as our grouping)
            val matchKey = student.displayName.lowercase()
                .split(" ", ".", "_")
                .filter { it.length > 1 }
                .sorted()
                .joinToString("")

            // 2. Calculate Distance
            val results = FloatArray(1)
            android.location.Location.distanceBetween(
                busLat, busLng,
                student.pickUpLat, student.pickUpLng,
                results
            )
            val distanceInMeters = results[0]

            // 3. DEBUG LOG: This is the most important log right now
            android.util.Log.d("PROXIMITY", "Student: ${student.displayName} | Distance: ${distanceInMeters.toInt()}m")

            // 4. Check if within 500m and not already notified
            if (distanceInMeters < 500 && !notifiedStudents.contains(matchKey)) {
                val firstName = student.displayName.split(" ").firstOrNull() ?: student.displayName

                android.util.Log.d("PROXIMITY", "!!! TRIGGERING SPEECH FOR $firstName !!!")

                // 5. Speak using your tts variable
                tts?.speak(
                    "Approaching $firstName's stop, please get ready.",
                    android.speech.tts.TextToSpeech.QUEUE_FLUSH,
                    null,
                    "proximity_id"
                )

                triggerParentNotification(student)
                notifiedStudents.add(matchKey)
            }
        }
    }
    fun markStudentAsBoarded(studentId: String) {
        database.child("students").child(studentId).child("status").setValue("Boarded")
    }

    fun onFingerprintScanned(hardwareId: Int?) {
        if (hardwareId == null) return
        val student = _studentList.value.find { it.fingerprintId == hardwareId }
        student?.let {
            markStudentAsBoarded(it.childId)
            tts?.speak("${it.displayName} has boarded", android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, null)
        }
    }

    fun setBusId(newBusId: String) {
        currentBusId = newBusId
        fetchAssignedStudents()
    }


    // ------------------- FETCH ASSIGNED STUDENTS -------------------
    private fun fetchAssignedStudents() {
        database.child("students")
            .addValueEventListener(object : com.google.firebase.database.ValueEventListener {
                override fun onDataChange(snapshot: com.google.firebase.database.DataSnapshot) {
                    val rawList = snapshot.children.mapNotNull { child ->
                        val student = child.getValue(Student::class.java) ?: return@mapNotNull null
                        student.copy(parentName = student.parentName.replace("+", " "))
                    }

                    val filteredList = rawList.groupBy { student ->
                        // 1. NAME MATCH: Both become "naceneza" (ignoring the single "N")
                        val nameParts = student.displayName.lowercase()
                            .split(" ", ".", "_")
                            .filter { it.length > 1 }
                            .sorted()
                            .joinToString("")

                        // 2. LOCATION MATCH: Multiplier changed from 100 to 10
                        // Phase 3 (-1.274) and Phase 2 (-1.275) will now both round to -13
                        val latKey = kotlin.math.round(student.pickUpLat * 10).toLong()
                        val lngKey = kotlin.math.round(student.pickUpLng * 10).toLong()

                        val finalKey = "$nameParts-$latKey-$lngKey"
                        android.util.Log.d("DriverFix", "Group Key: $finalKey")
                        finalKey
                    }.map { group ->
                        // Merges the duplicates into one row for the driver
                        group.value.first()
                    }
                    // FIXED: Removed .value from filteredList because it is a regular List
                    android.util.Log.d("DriverFix", "Raw: ${rawList.size} | Filtered: ${filteredList.size}")

                    _studentList.value = filteredList
                }

                override fun onCancelled(error: com.google.firebase.database.DatabaseError) {
                    android.util.Log.e("Firebase", "Error fetching students: ${error.message}")
                }
            })
    }


    @SuppressLint("MissingPermission")
    fun toggleTracking(activity: android.app.Activity? = null) {
        _isTracking.value = !_isTracking.value

        if (_isTracking.value) {
            // Pulls the first name, defaults to "Dereva" (Driver) if empty
            val name = _driverFirstName.value.ifEmpty { "Dereva" }

            // HIGH QUALITY VOICE CALL
            speakCloud("Sasa $name. Trip has started. Safari poa.")

            notifiedStudents.clear()

            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000).build()

            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                android.os.Looper.getMainLooper()
            ).addOnSuccessListener {
                android.util.Log.d("GPS_DEBUG", "Tracking active.")
            }
        } else {
            // HIGH QUALITY VOICE CALL FOR ENDING TRIP
            speakCloud("Trip ended. Ushinde poa.")

            fusedLocationClient.removeLocationUpdates(locationCallback)
        }
    }

    fun simulateBoarding(studentId: String, studentName: String) {
        markStudentAsBoarded(studentId)
        tts?.speak("$studentName has boarded", android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, null)
    }



    fun checkAndRequestLocationSettings(activity: android.app.Activity) {
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000).build()
        val builder = LocationSettingsRequest.Builder().addLocationRequest(locationRequest)
        val client: SettingsClient = LocationServices.getSettingsClient(activity)
        val task = client.checkLocationSettings(builder.build())

        task.addOnFailureListener { exception ->
            if (exception is com.google.android.gms.common.api.ResolvableApiException) {
                try {
                    // This is what triggers the "Turn on GPS?" popup
                    exception.startResolutionForResult(activity, 1001)
                } catch (sendEx: android.content.IntentSender.SendIntentException) {
                    // Ignore the error.
                }
            }
        }
    }

    fun saveDriverProfileIfNeeded(phoneNumber: String, fullName: String, nationalId: String, schoolName: String, onAlreadyRegistered: () -> Unit = {}) {
        val db = FirebaseFirestore.getInstance()
        val normalizedPhone = if (phoneNumber.startsWith("7")) "0$phoneNumber" else phoneNumber
        val docRef = db.collection("drivers").document(normalizedPhone)

        docRef.get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) {
                _mobileNumberError.value = "Mobile number not recognized"
                return@addOnSuccessListener
            }

            if (snapshot.getBoolean("hasSignedUp") == true) {
                _alreadyRegisteredError.value = "You’re registered, please Sign-in"
                onAlreadyRegistered()
                return@addOnSuccessListener
            }

            val updates = mapOf(
                "name" to fullName,
                "nationalId" to nationalId,
                "schoolName" to schoolName,
                "createdAt" to System.currentTimeMillis(),
                "hasSignedUp" to true
            )

            docRef.update(updates).addOnSuccessListener {
                _driverFirstName.value = fullName.split(" ").firstOrNull() ?: fullName
            }
        }
    }

    private fun triggerParentNotification(student: Student) {
        val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()


        val cleanName = student.parentName.replace("+", " ").trim()

        // 2. Search Firestore for the parent with that EXACT name
        db.collection("parents")
            .whereEqualTo("parentName", cleanName)
            .get()
            .addOnSuccessListener { snapshots ->
                if (snapshots != null && !snapshots.isEmpty) {
                    val parentDoc = snapshots.documents.first()
                    val tokens = parentDoc.get("fcmTokens") as? List<String>

                    if (!tokens.isNullOrEmpty()) {
                        tokens.forEach { token ->
                            sendPushToToken(
                                token,
                                "Bus Approaching! 🚌",
                                "The bus is nearing ${student.displayName}'s stop."
                            )
                        }
                        android.util.Log.d("🔥", "Match found! Notified ${tokens.size} devices for $cleanName")
                    }
                } else {
                    // This helps us debug if a name doesn't match
                    android.util.Log.e("🔥", "MATCH FAILED: Could not find '$cleanName' in Firestore")
                }
            }
    }


    private fun sendPushToToken(targetToken: String, title: String, body: String) {
        val json = """
            {
                "token": "$targetToken",
                "title": "$title",
                "body": "$body"
            }
        """.trimIndent()

        val mediaType = "application/json".toMediaType()
        val request = okhttp3.Request.Builder()
            .url("https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/sendBusNotification")
            .post(json.toRequestBody(mediaType))
            .build()

        okHttpClient.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                android.util.Log.e("PUSH_ERROR", "Failed to reach server: ${e.message}")
            }
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                android.util.Log.d("PUSH_SUCCESS", "Notification sent! Code: ${response.code}")
            }
        })
    }

        override fun onCleared() {
        super.onCleared()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        tts?.stop()
        tts?.shutdown()
        activeStatusListener?.remove()
        android.util.Log.d("TTS_DEBUG", "Cleanup complete: TTS and GPS stopped.")
    }

    // --- START OF NEW VOICE ENGINE ---
    private val okHttpClient = okhttp3.OkHttpClient()
    private val moshi = com.squareup.moshi.Moshi.Builder()
        .add(com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory())
        .build()

    fun speakCloud(text: String) {
        val apiKey = "AIzaSyAw9C7fTPJHwzl-KWiLPwaNjq0iYdXd7wo"
        val url = "https://texttospeech.googleapis.com/v1/text:synthesize?key=$apiKey"

        // Using Raw JSON to ensure double quotes and explicit Swahili voice parameters
        val jsonBody = """
            {
              "input": { "text": "$text" },
              "voice": { "languageCode": "sw-KE" },
              "audioConfig": { "audioEncoding": "MP3" }
            }
        """.trimIndent()

        val mediaType = "application/json".toMediaType()
        val request = okhttp3.Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody(mediaType))
            .build()

        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        val errorDetail = response.body?.string()
                        android.util.Log.e("CLOUD_TTS", "Server Error: ${response.code} | Details: $errorDetail")
                        return@launch
                    }

                    val responseBody = response.body?.string() ?: return@launch
                    val responseAdapter = moshi.adapter(TTSResponse::class.java)
                    val ttsResponse = responseAdapter.fromJson(responseBody)

                    ttsResponse?.audioContent?.let { base64Audio ->
                        val audioData = android.util.Base64.decode(base64Audio, android.util.Base64.DEFAULT)
                        playAudio(audioData)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("CLOUD_TTS", "Network Failed: ${e.message}")
                // FIXED: Switching to Main thread properly for TTS fallback
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    tts?.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, null)
                }
            }
        }
    }

    private fun playAudio(audioData: ByteArray) {
        try {
            val tempFile = java.io.File.createTempFile("tts_audio", "mp3", context.cacheDir)
            tempFile.deleteOnExit()
            java.io.FileOutputStream(tempFile).use { it.write(audioData) }

            android.media.MediaPlayer().apply {
                setDataSource(tempFile.absolutePath)
                prepare()
                start()
                setOnCompletionListener {
                    it.release()
                    tempFile.delete()
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("PLAY_AUDIO", "Error playing: ${e.message}")
        }
    }

}