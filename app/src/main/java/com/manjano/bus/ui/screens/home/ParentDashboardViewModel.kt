package com.manjano.bus.ui.screens.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import com.google.firebase.database.ChildEventListener
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import com.google.firebase.storage.StorageException

/** Sanitizes a string to be used as a Firebase Realtime Database key.
 * Converts to lowercase and replaces non-alphanumeric characters with underscores.
 */
private fun sanitizeKey(input: String): String {
    return input.trim().lowercase().replace(Regex("[^a-z0-9]"), "_")
}

class ParentDashboardViewModel(
) : ViewModel() {

    // XXXXXXXXXX PRIVATE CONTEXT XXXXXXXXXX
    private val _parentKey = MutableStateFlow("") // Initialize as empty
    val liveParentKey: StateFlow<String> = _parentKey

    // --- BUS LOCATION STATEFLOWS ---
    private val _busLocations = mutableMapOf<String, MutableStateFlow<LatLng>>()
    val busLocations: Map<String, StateFlow<LatLng>> get() = _busLocations

    fun getBusFlow(busId: String): StateFlow<LatLng> {
        return _busLocations.getOrPut(busId) {
            MutableStateFlow(LatLng(-1.2921, 36.8219))
        }
    }

    private val database =
        FirebaseDatabase.getInstance("https://manjano-bus-default-rtdb.firebaseio.com/").reference

    // --- Real-time children list ---
    private val _childrenKeys = MutableStateFlow<List<String>>(emptyList())
    val childrenKeys: StateFlow<List<String>> = _childrenKeys
    // CRITICAL FIX: Define childrenRef as a custom getter that reads the *current value* of the key flow
    private val parentRef: DatabaseReference
        get() = database.child("parents").child(_parentKey.value)

    private val childrenRef: DatabaseReference
        get() = parentRef.child("children")

    fun updateParentDisplayName(newName: String) {
        val currentKey = _parentKey.value
        val currentParentRef = database.child("parents").child(currentKey)

        // Only update _displayName in-place. The RTDB node key never changes after signup.
        // Renaming the node key caused ghost nodes because other cloud functions and listeners
        // were writing into the old key during the copy-then-delete window.
        currentParentRef.child("_displayName").setValue(newName)
            .addOnSuccessListener { Log.d("🔥", "Parent _displayName updated to '$newName' under key '$currentKey'") }
            .addOnFailureListener { Log.e("🔥", "Failed to update _displayName: ${it.message}") }

        // Update UI immediately
        _parentDisplayName.value = newName
    }


    fun initializeParent(rawParentName: String) {
        val initialKey = sanitizeKey(rawParentName)
        _parentKey.value = initialKey

        // One-time read to seed the display name before the init{} collectLatest listener kicks in
        database.child("parents").child(initialKey).child("_displayName").get()
            .addOnSuccessListener { snapshot ->
                if (snapshot.exists()) {
                    _parentDisplayName.value =
                        snapshot.getValue(String::class.java) ?: rawParentName
                } else {
                    database.child("parents").child(initialKey).child("_displayName")
                        .setValue(rawParentName)
                    _parentDisplayName.value = rawParentName
                }
            }
        // NOTE: No persistent ValueEventListener is added here.
        // The live listener that follows key changes is already set up in init{} via collectLatest.
        // Adding a second static listener here on initialKey caused ghost parent nodes to be
        // created whenever child fields (dropoff, pickupLang) were updated after a parent rename.
    }    private val _parentDisplayName = MutableStateFlow("")
    val parentDisplayName: StateFlow<String> get() = _parentDisplayName

    private val childrenEventListener = object : ChildEventListener {
        override fun onChildAdded(snapshot: DataSnapshot, previousChildName: String?) {
            val key = snapshot.key ?: return

            val displayNameRaw = snapshot.child("displayName").getValue(String::class.java)
            val displayName = displayNameRaw?.takeIf { it.isNotBlank() }
                ?: key.replace("_", " ").split(" ")
                    .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } }

            val photoUrlRaw = snapshot.child("photoUrl").getValue(String::class.java).orEmpty()
            val photoUrl =
                if (photoUrlRaw.isNotBlank() && photoUrlRaw != "null") photoUrlRaw else ""
            // Do NOT fallback to DEFAULT here — let repairAllChildImages handle it

            val eta =
                snapshot.child("eta").getValue(String::class.java).takeIf { !it.isNullOrBlank() }
                    ?: "Arriving in 5 minutes"
            val status =
                snapshot.child("status").getValue(String::class.java).takeIf { !it.isNullOrBlank() }
                    ?: "On Route"
            val active = snapshot.child("active").getValue(Boolean::class.java) ?: true
            val parentName = _parentDisplayName.value.ifBlank { "Unknown Parent" }

            val basicChildData = mapOf(
                "childId" to key,
                "displayName" to displayName,
                "photoUrl" to photoUrl,
                "eta" to eta,
                "status" to status,
                "active" to active,
                "parentName" to parentName
            )

            childrenRef.child(key).updateChildren(basicChildData)
                .addOnSuccessListener {
                    Log.d("🔥", "Child updated (merge) under parent: $key")
                }
                .addOnFailureListener {
                    Log.e("🔥", "Failed to update child under parent: ${it.message}")
                }

            database.child("students").child(key).updateChildren(basicChildData)
                .addOnSuccessListener {
                    Log.d("🔥", "Global student updated (merge): $key")
                }
                .addOnFailureListener {
                    Log.e("🔥", "Failed to update global student $key: ${it.message}")
                }
            if (!_childrenKeys.value.contains(key) && key == sanitizeKey(key)) {
                _childrenKeys.value = _childrenKeys.value + key
                Log.d("🔥", "Detected and Auto-Formatted child: $key")
            }

            if (photoUrl.isBlank()) {
                monitorStorageForChildImage(key)
            }
        }

        override fun onChildChanged(snapshot: DataSnapshot, previousChildName: String?) {
            val key = snapshot.key ?: return

            viewModelScope.launch {
                _childrenKeys.value = _childrenKeys.value.toMutableList().apply {
                    Log.d("🔥", "childrenEventListener: onChildChanged -> $key")
                }
            }

            val displayNameRaw = snapshot.child("displayName").getValue(String::class.java)
            val displayName = displayNameRaw?.takeIf { it.isNotBlank() }
                ?: key.replace("_", " ").split(" ")
                    .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } }

            val photoUrlRaw = snapshot.child("photoUrl").getValue(String::class.java).orEmpty()
            val photoUrl =
                if (photoUrlRaw.isNotBlank() && photoUrlRaw != "null") photoUrlRaw else ""
            // Do NOT fallback to DEFAULT here — let repairAllChildImages handle it

            val eta =
                snapshot.child("eta").getValue(String::class.java).takeIf { !it.isNullOrBlank() }
                    ?: "Arriving in 5 minutes"
            val status =
                snapshot.child("status").getValue(String::class.java).takeIf { !it.isNullOrBlank() }
                    ?: "On Route"
            val active = snapshot.child("active").getValue(Boolean::class.java) ?: true
            val parentName = _parentDisplayName.value.ifBlank { "Unknown Parent" }

            val updates = mutableMapOf<String, Any>()

            if (!snapshot.hasChild("childId")) updates["childId"] = key
            if (!snapshot.hasChild("displayName")) updates["displayName"] = displayName
            if (!snapshot.hasChild("photoUrl")) updates["photoUrl"] = photoUrl
            if (!snapshot.hasChild("eta")) updates["eta"] = eta
            if (!snapshot.hasChild("status")) updates["status"] = status
            if (!snapshot.hasChild("active")) updates["active"] = active
            if (!snapshot.hasChild("parentName")) updates["parentName"] = parentName

            if (updates.isNotEmpty()) {
                childrenRef.child(key).updateChildren(updates)
                    .addOnSuccessListener {
                        Log.d("🔥", "Filled missing fields in parent/children/$key")
                    }

                database.child("students").child(key).updateChildren(updates)
                    .addOnSuccessListener {
                        Log.d("🔥", "Filled missing fields in students/$key")
                    }
            }

            if (photoUrl.isBlank()) {
                monitorStorageForChildImage(key)
            }
        }


        override fun onChildRemoved(snapshot: DataSnapshot) {
            val childKey = snapshot.key ?: return

            _childrenKeys.value = _childrenKeys.value.filter { it != childKey }
            Log.d("🔥", "Child removed from parent: $childKey")

            database.child("students").child(childKey)
                .removeValue()
                .addOnSuccessListener {
                    Log.d("🔥", "Global student removed: $childKey")
                }
                .addOnFailureListener { e ->
                    Log.e("🔥", "Failed to remove student $childKey: ${e.message}")
                }
        }

        override fun onChildMoved(snapshot: DataSnapshot, previousChildName: String?) { /* ignore */
        }

        override fun onCancelled(error: DatabaseError) {
            Log.e("🔥", "childrenEventListener cancelled: ${error.message}")
        }
    }

    fun addNewChild(childKey: String, displayName: String) {
        val normalizedKey = sanitizeKey(childKey)
        val photoUrl = DEFAULT_CHILD_PHOTO_URL
        val eta = "Arriving in 5 minutes"
        val status = "On Route"
        val active = true
        val parentName = _parentDisplayName.value.ifBlank { "Unknown Parent" }

        val basicChildData = mapOf(
            "childId" to normalizedKey,
            "displayName" to displayName,
            "photoUrl" to photoUrl,
            "eta" to eta,
            "status" to status,
            "active" to active,
            "parentName" to parentName
        )

        childrenRef.child(normalizedKey).updateChildren(basicChildData)
            .addOnSuccessListener {
                Log.d("🔥", "Child created under parent: $normalizedKey")
            }
            .addOnFailureListener {
                Log.e("🔥", "Failed to create child under parent: ${it.message}")
            }

        database.child("students").child(normalizedKey).updateChildren(basicChildData)
            .addOnSuccessListener {
                Log.d("🔥", "Child mirrored to students: $normalizedKey")
            }
            .addOnFailureListener {
                Log.e("🔥", "Failed to mirror child to students: ${it.message}")
            }
    }
    private var displayNameListener: ValueEventListener? = null
    private var displayNameListenerRef: com.google.firebase.database.DatabaseReference? = null
    private var childrenEventListenerRef: com.google.firebase.database.DatabaseReference? = null
    private var childrenRenameListener: ValueEventListener? = null
    private var childrenRenameListenerRef: com.google.firebase.database.DatabaseReference? = null

    init {
        observeBusLocation()

        viewModelScope.launch {
            liveParentKey.collectLatest { key ->
                if (key.isNotBlank()) {
                    // Remove all previous listeners before attaching new ones
                    displayNameListenerRef?.let { ref ->
                        displayNameListener?.let { ref.removeEventListener(it) }
                    }
                    childrenEventListenerRef?.let { ref ->
                        ref.removeEventListener(childrenEventListener)
                    }
                    childrenRenameListenerRef?.let { ref ->
                        childrenRenameListener?.let { ref.removeEventListener(it) }
                    }

                    val currentParentRef = database.child("parents").child(key)
                    val currentChildrenRef = currentParentRef.child("children")

                    val newDisplayNameListener = object : ValueEventListener {
                        override fun onDataChange(snapshot: DataSnapshot) {
                            val remoteName = snapshot.getValue(String::class.java)
                            if (remoteName == null || remoteName.isBlank()) {
                                _parentDisplayName.value = ""
                                Log.d("🔥", "Parent _displayName deleted or empty - cleared name in UI")
                            } else {
                                _parentDisplayName.value = remoteName
                                Log.d("🔥", "UI Greeting updated to: $remoteName")

                                currentChildrenRef.get().addOnSuccessListener { childrenSnapshot ->
                                    if (childrenSnapshot.exists()) {
                                        val updates = mutableMapOf<String, Any>()
                                        childrenSnapshot.children.forEach { child ->
                                            val childKey = child.key ?: return@forEach
                                            updates["$childKey/parentName"] = remoteName
                                            database.child("students").child(childKey)
                                                .child("parentName").setValue(remoteName)
                                        }
                                        currentChildrenRef.updateChildren(updates)
                                            .addOnSuccessListener {
                                                Log.d("🔥", "Children nodes updated with new parent name: $remoteName")
                                            }
                                    }
                                }
                            }
                        }

                        override fun onCancelled(error: DatabaseError) {
                            Log.e("🔥", "Parent display name listener cancelled: ${error.message}")
                            _parentDisplayName.value = ""
                        }
                    }

                    val newRenameListener = object : ValueEventListener {
                        private val renameInProgress = mutableSetOf<String>()
                        override fun onDataChange(snapshot: DataSnapshot) {
                            for (childSnap in snapshot.children) {
                                val childKey = childSnap.key ?: continue
                                val displayName =
                                    childSnap.child("displayName").getValue(String::class.java)
                                        ?: continue
                                val normalizedNewKey = sanitizeKey(displayName)
                                if (childKey != normalizedNewKey && !renameInProgress.contains(childKey)) {
                                    renameInProgress.add(childKey)
                                    renameChildNode(oldKey = childKey, newKey = normalizedNewKey) {
                                        renameInProgress.remove(childKey)
                                    }
                                }
                            }
                        }

                        override fun onCancelled(error: DatabaseError) {}
                    }

                    displayNameListener = newDisplayNameListener
                    displayNameListenerRef = currentParentRef.child("_displayName")
                    displayNameListenerRef!!.addValueEventListener(newDisplayNameListener)

                    childrenEventListenerRef = currentChildrenRef
                    currentChildrenRef.addChildEventListener(childrenEventListener)

                    childrenRenameListener = newRenameListener
                    childrenRenameListenerRef = currentChildrenRef
                    currentChildrenRef.addValueEventListener(newRenameListener)

                    viewModelScope.launch {
                        delay(5000)
                        autoCleanupDuplicates()
                    }

                    viewModelScope.launch {
                        delay(6000)
                        repairMissingChildrenFromStudents()
                    }

                    viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                        while (true) {
                            try {
                                val storage = com.google.firebase.storage.FirebaseStorage.getInstance().reference.child("Children Images")
                                val listResult = com.google.android.gms.tasks.Tasks.await(storage.listAll())
                                val rawFileNames = listResult.items.map { it.name }
                                repairAllChildImages(rawFileNames)
                            } catch (e: Exception) {
                                android.util.Log.e("🔥", "Background Storage Monitor Error: ${e.message}")
                            }
                            kotlinx.coroutines.delay(10000)
                        }
                    }
                }
            }
        }
    }
    fun monitorStorageForChildImage(childKey: String) {
        if (activeStorageMonitors.contains(childKey)) return
        activeStorageMonitors.add(childKey)

        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val storageRef =
                com.google.firebase.storage.FirebaseStorage.getInstance().reference.child("Children Images/$childKey.png")

            liveParentKey.collectLatest { pKey ->
                if (pKey.isBlank()) return@collectLatest

                var imageFound = false
                while (!imageFound) {
                    try {
                        val url = storageRef.downloadUrl.await().toString()

                        database.child("parents")
                            .child(pKey)
                            .child("children")
                            .child(childKey)
                            .child("photoUrl")
                            .setValue(url)
                            .await()

                        imageFound = true
                        activeStorageMonitors.remove(childKey)
                    } catch (e: Exception) {
                        kotlinx.coroutines.delay(5000L)
                    }
                }
            }
        }
    }

    // Inside your ViewModel:
    private val activeStorageMonitors = mutableSetOf<String>()

    fun getValidChildNames(): StateFlow<List<String>> {
        val result = MutableStateFlow<List<String>>(emptyList())

        childrenRef.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val names = mutableListOf<String>()
                snapshot.children.forEach { childSnap ->
                    val displayName = childSnap.child("displayName").getValue(String::class.java)
                    val key = childSnap.key

                    if (displayName != null && key != null) {
                        val correctKey = displayName.trim().lowercase().replace(Regex("[^a-z0-9]"), "_")
                        // Only include if key is correct
                        if (key == correctKey) {
                            names.add(displayName)
                        }
                    }
                }
                result.value = names.sorted()
            }

            override fun onCancelled(error: DatabaseError) {
                Log.e("🔥", "Failed to get valid child names: ${error.message}")
            }
        })

        return result
    }


    private fun observeBusLocation() {
        val busRef = database.child("busLocation")
        busRef.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val busId = snapshot.key ?: "unknown_bus"
                val lat = snapshot.child("lat").getValue(Double::class.java)
                val lng = snapshot.child("lng").getValue(Double::class.java)
                if (lat != null && lng != null) {
                    _busLocations.getOrPut(busId) {
                        MutableStateFlow(
                            LatLng(
                                -1.2921,
                                36.8219
                            )
                        )
                    }.value =
                        LatLng(lat, lng)
                }
            }

            override fun onCancelled(error: DatabaseError) {
                Log.e("ParentDashboard", "Bus location listener cancelled: ${error.message}")
            }
        })
    }
    /** Automatically clean up duplicate nodes (call once on app start) */
    fun autoCleanupDuplicates() {
        childrenRef.get().addOnSuccessListener { snapshot ->
            Log.d("🔥", "Starting auto-cleanup for ${snapshot.childrenCount} children")

            val displayNameToKeyMap = mutableMapOf<String, String>() // displayName → correctKey
            val duplicatesToDelete = mutableListOf<String>()
            val nodesToRename = mutableListOf<Pair<String, String>>() // (oldKey, newKey)

            // First pass: identify duplicates and incorrect keys
            snapshot.children.forEach { childSnap ->
                val key = childSnap.key ?: return@forEach
                val displayName = childSnap.child("displayName").getValue(String::class.java) ?: return@forEach
                val correctKey = displayName.trim().lowercase().replace(Regex("[^a-z0-9]"), "_")

                // Case 1: Key is wrong but not a duplicate yet
                if (key != correctKey && !displayNameToKeyMap.containsValue(correctKey)) {
                    nodesToRename.add(Pair(key, correctKey))
                    displayNameToKeyMap[displayName] = correctKey
                }
                // Case 2: Duplicate displayName (same child, different keys)
                else if (displayNameToKeyMap.containsKey(displayName)) {
                    val existingKey = displayNameToKeyMap[displayName]!!
                    Log.d("🔥", "Found duplicate: $key has same displayName as $existingKey ('$displayName')")

                    // Keep the one with correct key, delete others
                    if (correctKey == existingKey) {
                        duplicatesToDelete.add(key) // Delete the wrong key
                    } else {
                        duplicatesToDelete.add(existingKey) // Delete the old wrong key
                        displayNameToKeyMap[displayName] = correctKey
                    }
                }
                // Case 3: First time seeing this displayName
                else {
                    displayNameToKeyMap[displayName] = key
                }
            }

            Log.d("🔥", "Found ${nodesToRename.size} to rename, ${duplicatesToDelete.size} to delete")

            // Execute renames (with delay to avoid Firebase limits)
            nodesToRename.forEachIndexed { index, (oldKey, newKey) ->
                viewModelScope.launch {
                    delay(index * 100L) // Stagger requests
                    renameChildNode(oldKey, newKey)
                }
            }

            // Execute deletions
            duplicatesToDelete.forEachIndexed { index, key ->
                viewModelScope.launch {
                    delay(nodesToRename.size * 100L + index * 100L) // After renames
                    childrenRef.child(key).removeValue().addOnSuccessListener {
                        Log.d("🔥", "Auto-deleted duplicate: $key")
                    }
                }
            }
        }
    }


    /** Initialize all children from a list of names */
    fun initializeChildrenFromList(childNames: List<String>) {
        // CRITICAL FIX: Since SignUpViewModel now creates all nodes under /parents,
        // we only need to ensure the listeners and UI are active.
        // We stop all data writes here to prevent race conditions and preserve the
        // single source of truth (SignUpViewModel).
        Log.d("🔥", "Initialization skipped writes. Listening to live data now.")
    }

    private fun renameChildNode(oldKey: String, newKey: String, onRenamed: (String) -> Unit = {}) {
        // Prevent duplicate in UI during rename: remove old key immediately
        _childrenKeys.value = _childrenKeys.value.filter { it != oldKey }

        childrenRef.child(oldKey).get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) return@addOnSuccessListener

            val oldData = snapshot.value as? Map<*, *> ?: return@addOnSuccessListener
            val updatedData = oldData.toMutableMap()

            childrenRef.child(newKey).setValue(updatedData).addOnSuccessListener {
                viewModelScope.launch {
                    val storage = com.google.firebase.storage.FirebaseStorage.getInstance().reference.child("Children Images")
                    storage.listAll().addOnSuccessListener { listResult ->
                        val storageFiles = listResult.items.map { it.name }
                        val normalizedFiles = storageFiles.associateBy {
                            it.substringBeforeLast(".").substringAfterLast("/").lowercase().replace(Regex("[^a-z0-9]"), "_")
                        }

                        val matchedFile = findBestImageMatch(newKey, normalizedFiles)
                        val encodedFileName = if (matchedFile != null) android.net.Uri.encode(matchedFile) else null
                        val verifiedUrl = if (encodedFileName == null) DEFAULT_CHILD_PHOTO_URL
                        else "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Children%20Images%2F$encodedFileName?alt=media"

                        childrenRef.child(newKey).child("photoUrl").setValue(verifiedUrl).addOnCompleteListener {
                            // Force remove old key from UI immediately (prevents ghost duplicate)
                            _childrenKeys.value = _childrenKeys.value.filter { it != oldKey }

                            childrenRef.child(oldKey).removeValue()
                                .addOnSuccessListener {
                                    Log.d("🔥", "Successfully deleted old node: $oldKey")
                                    database.child("decommissionedKeys").child(oldKey)
                                        .setValue(true)

                                    // Ensure new key is in list (no duplicate)
                                    val current = _childrenKeys.value.toMutableList()
                                    if (!current.contains(newKey)) {
                                        current.add(newKey)
                                    }
                                    _childrenKeys.value =
                                        current.distinct() // remove any accidental duplicates

                                    onRenamed(newKey)
                                    Log.d(
                                        "🔥",
                                        "Transfer Complete: $oldKey -> $newKey with verified image. UI cleaned."
                                    )
                                }
                                .addOnFailureListener { error ->
                                    Log.e(
                                        "🔥",
                                        "Failed to delete old node $oldKey: ${error.message}"
                                    )
                                }
                        }
                    }
                }
            }.addOnFailureListener { error ->
                Log.e("🔥", "Rename failed: ${error.message}")
            }
        }
    }

    private fun ViewModel.addCloseableListener(
        ref: DatabaseReference,
        listener: ValueEventListener
    ) {
        this.addCloseable { ref.removeEventListener(listener) }
    }

    private fun ViewModel.addCloseable(onCleared: () -> Unit) {
        viewModelScope.launch {
            try {
                delay(Long.MAX_VALUE)
            } finally {
                onCleared()
            }
        }
    }

    /** Observe ETA updates – no creation, accepts only the normalized KEY */
    fun getEtaFlowByName(key: String): StateFlow<String> {
        // NOTE: The key is expected to be the correct, normalized key (e.g., 'dez_gatesh')
        val etaFlow = MutableStateFlow("Loading...")

        val ref = childrenRef.child(key).child("eta")
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val eta = snapshot.getValue(String::class.java) ?: "Arriving in 5 minutes"
                if (etaFlow.value != eta) etaFlow.value = eta
            }

            override fun onCancelled(error: DatabaseError) {
                etaFlow.value = "Error loading ETA"
            }
        }
        ref.addValueEventListener(listener)
        addCloseableListener(ref, listener)
        return etaFlow
    }

    /** Observe displayName updates – no creation, accepts only the normalized KEY */
    fun getDisplayNameFlow(key: String): StateFlow<String> {
        // NOTE: The key is expected to be the correct, normalized key (e.g., 'dez_gatesh')
        val nameFlow = MutableStateFlow("Loading...")

        val ref = childrenRef.child(key).child("displayName")
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val displayNameRaw = snapshot.getValue(String::class.java)
                val name = displayNameRaw?.takeIf { it.isNotBlank() }
                    ?: key.replace("_", " ").split(" ")
                        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercaseChar() } }
                if (nameFlow.value != name) nameFlow.value = name
            }

            override fun onCancelled(error: DatabaseError) {
                nameFlow.value = "Error loading name"
            }
        }
        ref.addValueEventListener(listener)
        addCloseableListener(ref, listener)
        return nameFlow
    }

    /** Observe child's status – no creation, accepts only the normalized KEY */
    fun getStatusFlow(key: String): StateFlow<String> {
        // NOTE: No key calculation here, only use the provided key
        val statusFlow = MutableStateFlow("Loading...")

        val ref = childrenRef.child(key).child("status")
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val status = snapshot.getValue(String::class.java) ?: "Unknown"
                if (statusFlow.value != status) statusFlow.value = status
            }

            override fun onCancelled(error: DatabaseError) {
                statusFlow.value = "Error loading status"
            }
        }
        ref.addValueEventListener(listener)
        addCloseableListener(ref, listener)
        return statusFlow
    }


    /** Update child's status, accepts only the normalized KEY */
    fun updateChildStatus(key: String, newStatus: String) {
        // NOTE: No key calculation here, only use the provided key
        childrenRef.child(key).child("status").setValue(newStatus)
    }

    /** Send quick action message, accepts only the normalized KEY */
    fun sendQuickActionMessage(key: String, action: String, message: String) {
        // NOTE: No key calculation here, only use the provided key
        val messageRef = childrenRef.child(key).child("messages").push()
        val msgData = mapOf(
            "action" to action,
            "message" to message,
            "timestamp" to System.currentTimeMillis()
        )
        messageRef.setValue(msgData)
    }

    /** Save child image */
    private fun saveChildImage(childKey: String, displayName: String, storageFiles: List<String>) {
        val normalizedChild = childKey.trim().lowercase().replace(Regex("[^a-z0-9]"), "_")
        val normalizedFiles = storageFiles.associateBy {
            it.substringBeforeLast(".").substringAfterLast("/").lowercase()
                .replace(Regex("[^a-z0-9]"), "_")
        }
        val matchedFile = normalizedFiles[normalizedChild]
        val finalUrl = if (matchedFile == null) DEFAULT_CHILD_PHOTO_URL
        else "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Children%20Images%2F$matchedFile?alt=media"
        database.child("children").child(normalizedChild).child("photoUrl").setValue(finalUrl)
    }

    fun repairAllChildImages(storageFiles: List<String>) {
        val normalizedFiles = storageFiles.associateBy { fileName ->
            fileName.substringBeforeLast(".").lowercase().trim().replace(Regex("[^a-z0-9]"), "_")
        }

        childrenRef.get().addOnSuccessListener { snapshot ->
            if (!snapshot.exists()) return@addOnSuccessListener

            snapshot.children.forEach { childSnap ->
                val key = childSnap.key ?: return@forEach
                val currentUrl = childSnap.child("photoUrl").getValue(String::class.java).orEmpty()
                val matchedFileName = findBestImageMatch(key, normalizedFiles)

                if (matchedFileName != null) {
                    val encodedName = android.net.Uri.encode(matchedFileName)
                    val newUrl =
                        "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Children%20Images%2F$encodedName?alt=media"

                    if (currentUrl != newUrl) {
                        childrenRef.child(key).child("photoUrl").setValue(newUrl)
                            .addOnSuccessListener {
                                Log.d("🔥", "AUTO-DETECT: Image updated for $key")
                            }
                    }
                } else {
                    if (!currentUrl.contains("defaultchild.png") && currentUrl.isNotBlank() && currentUrl != "null") {
                        childrenRef.child(key).child("photoUrl").setValue(DEFAULT_CHILD_PHOTO_URL)
                            .addOnSuccessListener {
                                Log.d(
                                    "🔥",
                                    "AUTO-CLEAN: Image missing from storage for $key. Reverted to default."
                                )
                            }
                    }
                }
            }
        }
    }

    /** Smart family matching - works with separated (ati_una_kuja) AND concatenated (atiunakuja) filenames */
    private fun findBestImageMatch(childKey: String, normalizedFiles: Map<String, String>): String? {
        val cleanKey = childKey.lowercase().trim()

        if (normalizedFiles.containsKey(cleanKey)) return normalizedFiles[cleanKey]

        val fuzzyMatch = normalizedFiles.entries.find { (imgKey, _) ->
            imgKey == cleanKey || imgKey.replace("_", "").contains(cleanKey.replace("_", "")) || cleanKey.replace("_", "").contains(imgKey.replace("_", ""))
        }
        if (fuzzyMatch != null) return fuzzyMatch.value

        val parts = cleanKey.split("_").filter { it.length >= 2 }
        if (parts.isEmpty()) return null

        return normalizedFiles.entries.find { (imgKey, _) ->
            parts.all { part -> imgKey.contains(part) }
        }?.value
    }

    /** Observe photoUrl flow - purely observational, no creation, no initial await() */
    fun getPhotoUrlFlow(key: String): StateFlow<String> {
        val photoFlow = MutableStateFlow(DEFAULT_CHILD_PHOTO_URL)

        viewModelScope.launch {
            // Whenever the parent key changes, restart the listener on the new path
            liveParentKey.collectLatest { pKey ->
                if (pKey.isBlank()) return@collectLatest

                val dbRef = database.child("parents").child(pKey).child("children").child(key).child("photoUrl")

                val listener = object : ValueEventListener {
                    override fun onDataChange(snapshot: DataSnapshot) {
                        val dbUrl = snapshot.getValue(String::class.java).orEmpty()
                        photoFlow.value = if (dbUrl.isNotBlank()) dbUrl else DEFAULT_CHILD_PHOTO_URL
                    }
                    override fun onCancelled(error: DatabaseError) {}
                }

                dbRef.addValueEventListener(listener)

                // Keep listener alive until the parent key changes again or ViewModel cleared
                try {
                    kotlinx.coroutines.awaitCancellation()
                } finally {
                    dbRef.removeEventListener(listener)
                }
            }
        }

        return photoFlow
    }

    /** Fetch all storage files and repair */
    fun fetchAndRepairChildImages(storageFiles: List<String>) {
        viewModelScope.launch { repairAllChildImages(storageFiles) }
    }

    private fun repairMissingChildrenFromStudents() {
        val currentKey = _parentKey.value
        if (currentKey.isBlank()) return

        val parentDisplay = _parentDisplayName.value
        if (parentDisplay.isBlank()) return

        database.child("students").get().addOnSuccessListener { snapshot ->
            snapshot.children.forEach { studentSnap ->
                val studentKey = studentSnap.key ?: return@forEach
                val studentParentName = studentSnap.child("parentName").getValue(String::class.java) ?: ""

                if (studentParentName.equals(parentDisplay, ignoreCase = true)) {
                    childrenRef.child(studentKey).get().addOnSuccessListener { childSnap ->
                        if (!childSnap.exists()) {
                            val childData = studentSnap.value as? Map<*, *> ?: return@addOnSuccessListener
                            childrenRef.child(studentKey).setValue(childData)
                                .addOnSuccessListener {
                                    Log.d("🔥", "Repaired missing child $studentKey under parent $currentKey")
                                }
                        }
                    }
                }
            }
        }
    }


    companion object {
        private const val DEFAULT_CHILD_PHOTO_URL =
            "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Default%20Image%2Fdefaultchild.png?alt=media"
    }
}