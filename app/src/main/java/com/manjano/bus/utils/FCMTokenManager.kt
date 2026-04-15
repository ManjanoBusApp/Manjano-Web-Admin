package com.manjano.bus.utils

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging



object FCMTokenManager {

    fun getTokenAndSave(parentPhoneNumber: String) {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (token != null) {
                val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()

                // Using arrayUnion ensures we support MULTI-DEVICE (adds token without deleting others)
                db.collection("parents").document(parentPhoneNumber)
                    .update("fcmTokens", com.google.firebase.firestore.FieldValue.arrayUnion(token))
                    .addOnSuccessListener {
                        android.util.Log.d("FCM", "Token saved for $parentPhoneNumber")
                    }
            }
        }
    }

    fun getToken(onResult: (String?) -> Unit) {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> onResult(token) }
            .addOnFailureListener { onResult(null) }
    }
}