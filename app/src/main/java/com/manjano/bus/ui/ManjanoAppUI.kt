package com.manjano.bus.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.compose.rememberNavController
import com.manjano.bus.MainActivity
import com.manjano.bus.ui.theme.ManjanoTheme
import com.manjano.bus.ui.navigation.AppNavGraph


@Composable
fun ManjanoAppUI() {
    val navController = rememberNavController()

    val shouldStartAtSignin = MainActivity.shouldNavigateToSignin()

    // 🔥 Properly collect the StateFlow value
    val deactivatedRole by MainActivity.deactivatedUserRole.collectAsState()

    ManjanoTheme {
        AppNavGraph(
            navController = navController,
            startAtSignin = shouldStartAtSignin,
            deactivatedRole = deactivatedRole
        )
    }
}