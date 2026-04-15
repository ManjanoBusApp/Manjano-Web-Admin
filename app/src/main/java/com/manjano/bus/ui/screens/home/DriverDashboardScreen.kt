package com.manjano.bus.ui.screens.home

import android.Manifest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavHostController
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.rememberCameraPositionState
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import com.manjano.bus.R
import coil.compose.rememberAsyncImagePainter
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil.compose.rememberAsyncImagePainter
import coil.request.ImageRequest
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.activity.compose.BackHandler

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun DriverDashboardScreen(
    navController: NavHostController,
    driverPhoneNumber: String
) {
    // 1. Get Context and ViewModel once at the very top
    val context = LocalContext.current
    val viewModel: DriverDashboardViewModel = hiltViewModel()

    val isTracking by viewModel.isTracking.collectAsState()
    val isDriverActive by viewModel.isDriverActive.collectAsState()

    val locationPermissionState = rememberMultiplePermissionsState(
        listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    )

    BackHandler {
        navController.navigate("welcome") {
            popUpTo(0) { inclusive = true }
            launchSingleTop = true
        }
    }

    LaunchedEffect(locationPermissionState.allPermissionsGranted) {
        if (!locationPermissionState.allPermissionsGranted && locationPermissionState.shouldShowRationale) {
            navController.navigate("welcome") {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    LaunchedEffect(driverPhoneNumber) {
        android.util.Log.d(
            "NameFixDebug",
            "Dashboard LaunchedEffect | driverPhoneNumber arg received: '$driverPhoneNumber'"
        )
        viewModel.setLoggedInDriverPhoneNumber(driverPhoneNumber)
        viewModel.fetchDriverNameRealtime(driverPhoneNumber)
    }

    // Auto-logout when admin sets active to false
    LaunchedEffect(isDriverActive) {
        android.util.Log.d("DriverActiveStatus", "Active status observed: $isDriverActive")
        if (isDriverActive == false) {
            android.util.Log.d("DriverActiveStatus", "Driver deactivated by admin - logging out")
            val prefs = android.preference.PreferenceManager.getDefaultSharedPreferences(context)
            prefs.edit().remove("driver_logged_in").apply()

            navController.navigate("welcome") {
                popUpTo(0) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    LaunchedEffect(Unit) {
        locationPermissionState.launchMultiplePermissionRequest()
        val activity = context as? androidx.fragment.app.FragmentActivity
        activity?.let {
            viewModel.checkAndRequestLocationSettings(it)
        }
    }

    LaunchedEffect(Unit) {
        locationPermissionState.launchMultiplePermissionRequest()
        val activity = context as? androidx.fragment.app.FragmentActivity
        activity?.let {
            viewModel.checkAndRequestLocationSettings(it)
        }
    }

    if (locationPermissionState.allPermissionsGranted) {
        DashboardContent(
            navController = navController,
            viewModel = viewModel
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardContent(
    navController: NavHostController,
    viewModel: DriverDashboardViewModel
) {
    val isTracking by viewModel.isTracking.collectAsState()
    val students by viewModel.studentList.collectAsState()
    val driverFirstName by viewModel.driverFirstName.collectAsState() // collect from ViewModel
    val beijingRoad = LatLng(-1.3815977, 36.9395961)
    val context = LocalContext.current

    // Standard approach to get FragmentActivity in Compose
    val activity = remember(context) {
        var currentContext = context
        while (currentContext is android.content.ContextWrapper) {
            if (currentContext is FragmentActivity) break
            currentContext = currentContext.baseContext
        }
        currentContext as? FragmentActivity
    }

    val executor = remember(context) { ContextCompat.getMainExecutor(context) }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(beijingRoad, 15f)
    }

    val hasLocationPermission = remember(context) {
        androidx.core.content.ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    val scaffoldState = rememberBottomSheetScaffoldState(
        bottomSheetState = rememberStandardBottomSheetState(
            initialValue = SheetValue.PartiallyExpanded
        )
    )
    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = 180.dp,
        sheetContainerColor = Color.White,
        sheetContent = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (driverFirstName.isNotBlank()) "👋 Sasa $driverFirstName" else "👋 Sasa",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )

                    Text(
                        text = "Sign Out",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.Red,
                        modifier = Modifier.clickable {
                            navController.navigate("welcome")
                        }
                    )
                }
                HorizontalDivider(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .padding(bottom = 4.dp)
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Please Scroll Up",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF800080),
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    Text(
                        text = "Student List",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.Black,
                        textAlign = TextAlign.Center
                    )
                }

                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 80.dp)
                ) {
                    items(students) { student ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(50.dp)
                                    .clip(CircleShape)
                                    .background(Color.LightGray)
                            ) {
                                val storageDefaultUrl =
                                    "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Default%20Image%2Fdefaultchild.png?alt=media"

                                val imagePainter = rememberAsyncImagePainter(
                                    model = ImageRequest.Builder(LocalContext.current)
                                        .data(if (student.photoUrl.isNullOrBlank() || student.photoUrl == "null") storageDefaultUrl else student.photoUrl)
                                        .crossfade(true)
                                        .build()
                                )

                                Image(
                                    painter = imagePainter,
                                    contentDescription = "Student Photo",
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop
                                )

                                if (imagePainter.state is coil.compose.AsyncImagePainter.State.Loading ||
                                    imagePainter.state is coil.compose.AsyncImagePainter.State.Error
                                ) {
                                    Image(
                                        painter = painterResource(R.drawable.defaultchild),
                                        contentDescription = null,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = student.displayName,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = Color.Black,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Parent: ${student.parentName.replace("+", " ")}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.Gray
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier
            .padding(paddingValues)
            .fillMaxSize()
            .padding(top = 32.dp)
        ) {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
                properties = MapProperties(
                    isTrafficEnabled = true,
                    isMyLocationEnabled = hasLocationPermission
                )
            )

            // Start/End Trip button - moved to top, fixed position, always visible
            Button(
                onClick = {
                    // This finds the "window" (Activity) to show the GPS popup
                    val activity = context as? android.app.Activity
                    viewModel.toggleTracking(activity)
                },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 32.dp)
                    .fillMaxWidth(0.8f)
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isTracking) Color.Red else Color(0xFF4CAF50)
                )
            ) {
                Text(
                    text = if (isTracking) "END TRIP" else "START TRIP",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White
                )
            }
        }
    }
}