package com.nativelocalstorage;

import android.app.Activity;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.annotation.NonNull;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Earth;
import com.google.ar.core.Frame;
import com.google.ar.core.GeospatialPose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.*;

import java.util.EnumSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NativeLocalStorageModule extends NativeLocalStorageSpec {

  public static final String NAME = "NativeLocalStorage";
  public static final String VPS_STATE_CHANGE_EVENT = "onVpsStateChange";
  public static final String VPS_LOG_EVENT = "onVpsLog";

  // State management
  private enum VpsState {
    NOT_SETUP,
    SETTING_UP,
    SETUP_FAILED,
    UNSUPPORTED,
    READY_TO_TRACK,
    PRETRACKING,
    TRACKING,
    EARTH_STATE_ERROR,
    CAMERA_NOT_AVAILABLE,
    FATAL_UPDATE_ERROR
  }

  private VpsState vpsState = VpsState.NOT_SETUP;

  private Session mSession;
  private boolean mUserRequestedInstall = true;
  private final ExecutorService executorService = Executors.newSingleThreadExecutor();
  private volatile boolean isPollingVpsState = false;

  public NativeLocalStorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  private void log(String message) {
    Log.d(NAME, "BUGABOO: " + message); // Keep logging to logcat
    try {
      getReactApplicationContext()
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
          .emit(VPS_LOG_EVENT, message);
    } catch (Exception e) {
      Log.e(NAME, "Failed to emit log event: " + e.getMessage());
    }
  }

  private void setState(VpsState newState) {
    if (this.vpsState == newState) {
      return; // No change, no event.
    }
    log("State changing from " + this.vpsState.toString() + " to " + newState.toString());
    this.vpsState = newState;

    getReactApplicationContext()
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(VPS_STATE_CHANGE_EVENT, newState.toString());
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void setupAR(Promise promise) {
    log("setupAR called.");
    setState(VpsState.SETTING_UP);
    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      log("ERROR: Activity does not exist.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ACTIVITY_DOES_NOT_EXIST");
      return;
    }

    // Permissions should be requested from the JS side before calling this method.
    // The SecurityException catch block below will handle cases where permissions
    // are missing.

    try {
      if (mSession == null) {
        log("mSession is null, creating new session.");
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getReactApplicationContext());
        if (!availability.isSupported()) {
          log("ARCore not supported. Availability: " + availability.toString());
          setState(VpsState.UNSUPPORTED);
          promise.resolve("ERROR_ARCORE_NOT_SUPPORTED");
          return;
        }

        // Request installation of Google Play Services for AR if needed.
        log("Requesting ARCore installation if needed.");
        ArCoreApk.InstallStatus installStatus = ArCoreApk.getInstance().requestInstall(currentActivity,
            mUserRequestedInstall);
        if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
          log("ARCore installation requested. User needs to interact.");
          mUserRequestedInstall = false;
          promise.resolve(false); // Indicate installation is in progress.
          return;
        }

        log("Creating new ARCore Session.");
        mSession = new Session(getReactApplicationContext(), EnumSet.of(Session.Feature.SHARED_CAMERA));
        log("ARCore Session created.");

        // Check if Geospatial is supported.
        log("Checking Geospatial support.");
        boolean supported = mSession.isGeospatialModeSupported(Config.GeospatialMode.ENABLED);
        if (!supported) {
          log("Geospatial mode not supported.");
          setState(VpsState.UNSUPPORTED);
          promise.resolve("ERROR_GEOSPATIAL_NOT_SUPPORTED");
          mSession.close();
          mSession = null;
          return;
        }
        log("Geospatial mode is supported.");

        Config config = mSession.getConfig();
        log("Setting Geospatial mode to ENABLED.");
        config.setGeospatialMode(Config.GeospatialMode.ENABLED);
        config.setStreetscapeGeometryMode(Config.StreetscapeGeometryMode.ENABLED);
        mSession.configure(config);
        log("ARCore session configured.");
      }
      log("setupAR successful.");
      setState(VpsState.READY_TO_TRACK);
      promise.resolve(true);
    } catch (UnavailableUserDeclinedInstallationException e) {
      log("setupAR failed: User declined ARCore installation.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_INSTALL_DECLINED");
    } catch (UnavailableArcoreNotInstalledException e) {
      log("setupAR failed: ARCore not installed.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_NOT_INSTALLED");
    } catch (UnavailableDeviceNotCompatibleException e) {
      log("setupAR failed: Device not compatible.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_NOT_COMPATIBLE");
    } catch (UnavailableApkTooOldException e) {
      log("setupAR failed: ARCore APK too old.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_APK_TOO_OLD");
    } catch (UnavailableSdkTooOldException e) {
      log("setupAR failed: ARCore SDK too old.");
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_SDK_TOO_OLD");
    } catch (FatalException e) {
      log("setupAR failed: Fatal error. " + e.getMessage());
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_FATAL_ERROR");
    } catch (SecurityException e) {
      log("setupAR failed: Security error (permissions?). " + e.getMessage());
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_SECURITY_ERROR");
    }
  }

  @ReactMethod
  public void startTracking(Promise promise) {
    log("startTracking called.");
    if (mSession == null) {
      log("startTracking failed: Session not initialized.");
      promise.resolve("ERROR_SESSION_NOT_INITIALIZED");
      return;
    }

    if (vpsState != VpsState.READY_TO_TRACK) {
      log("startTracking failed: Session not ready. Current state: " + vpsState.toString());
      promise.resolve("ERROR_SESSION_NOT_READY");
      return;
    }

    try {
      log("Resuming AR session.");
      mSession.resume();
      setState(VpsState.PRETRACKING);
      if (!isPollingVpsState) {
        log("Starting VPS state polling.");
        isPollingVpsState = true;
        executorService.submit(this::pollVpsState);
      }
      log("startTracking successful.");
      promise.resolve(true);
    } catch (SessionNotPausedException e) {
      log("startTracking failed: Session not paused. " + e.getMessage());
      promise.resolve("ERROR_SESSION_NOT_PAUSED");
    } catch (CameraNotAvailableException e) {
      log("startTracking failed: Camera not available. " + e.getMessage());
      promise.resolve("ERROR_CAMERA_NOT_AVAILABLE");
    } catch (SecurityException e) {
      log("startTracking failed: Camera permission not granted. " + e.getMessage());
      promise.resolve("ERROR_CAMERA_PERMISSION_NOT_GRANTED");
    } catch (IllegalStateException e) {
      log("startTracking failed: Illegal state. " + e.getMessage());
      promise.resolve("ERROR_ILLEGAL_STATE");
    } catch (UnsupportedConfigurationException e) {
      log("startTracking failed: Unsupported configuration. " + e.getMessage());
      promise.resolve("ERROR_UNSUPPORTED_CONFIGURATION");
    } catch (FatalException e) {
      log("startTracking failed: Fatal error. " + e.getMessage());
      promise.resolve("ERROR_FATAL");
    }
  }

  @ReactMethod
  public boolean stopTracking() {
    log("stopTracking called.");
    if (mSession == null) {
      log("stopTracking failed: Session not initialized.");
      return false;
    }
    log("Stopping VPS state polling.");
    isPollingVpsState = false;
    log("Pausing AR session.");
    mSession.pause();
    setState(VpsState.READY_TO_TRACK);
    log("stopTracking successful, state is now READY_TO_TRACK.");
    return true;
  }

  @ReactMethod
  public String getVpsState() {
    return vpsState.toString();
  }

  @ReactMethod
  @Override
  public void addListener(String eventName) {
    // Keep: Required for RN built in Event Emitter Calls.
  }

  @ReactMethod
  @Override
  public void removeListeners(double count) {
    // Keep: Required for RN built in Event Emitter Calls.
  }

  @ReactMethod
  public void getCameraGeospatialPose(Promise promise) {
    if (mSession == null) {
      promise.resolve("ERROR_SESSION_NOT_INITIALIZED");
      return;
    }

    Earth earth = mSession.getEarth();
    if (earth == null) {
      promise.resolve("ERROR_EARTH_NOT_AVAILABLE");
      return;
    }

    if (earth.getTrackingState() != TrackingState.TRACKING) {
      promise.resolve("ERROR_EARTH_NOT_TRACKING");
      return;
    }

    GeospatialPose cameraGeospatialPose = earth.getCameraGeospatialPose();
    WritableMap poseMap = Arguments.createMap();
    poseMap.putDouble("latitude", cameraGeospatialPose.getLatitude());
    poseMap.putDouble("longitude", cameraGeospatialPose.getLongitude());
    poseMap.putDouble("altitude", cameraGeospatialPose.getAltitude());
    poseMap.putDouble("verticalAccuracy", cameraGeospatialPose.getVerticalAccuracy());
    poseMap.putDouble("horizontalAccuracy", cameraGeospatialPose.getHorizontalAccuracy());
    poseMap.putDouble("orientationYawAccuracy", cameraGeospatialPose.getOrientationYawAccuracy());

    float[] quaternion = cameraGeospatialPose.getEastUpSouthQuaternion();
    WritableArray quaternionArray = Arguments.createArray();
    for (float v : quaternion) {
      quaternionArray.pushDouble(v);
    }
    poseMap.putArray("quaternion", quaternionArray);

    promise.resolve(poseMap);
  }

  @ReactMethod
  public void checkVpsAvailability(double latitude, double longitude, Promise promise) {
    log("checkVpsAvailability called for lat: " + latitude + ", lon: " + longitude);
    if (mSession == null) {
      log("checkVpsAvailability failed: Session not initialized.");
      promise.resolve("ERROR_SESSION_NOT_INITIALIZED");
      return;
    }

    try {
      log("Calling checkVpsAvailabilityAsync.");
      mSession.checkVpsAvailabilityAsync(latitude, longitude,
          (availability) -> {
            log("checkVpsAvailabilityAsync result: " + availability.toString());
            promise.resolve(availability.toString());
          });
    } catch (SecurityException e) {
      log("checkVpsAvailability failed: Internet permission not granted. " + e.getMessage());
      promise.resolve("ERROR_INTERNET_PERMISSION_NOT_GRANTED");
    }
  }

  @ReactMethod
  public void closeAR(Promise promise) {
    log("closeAR called.");
    isPollingVpsState = false;
    if (mSession != null) {
      try {
        log("Pausing session before closing.");
        mSession.pause();
        // Run session close on a separate thread
        // TODO: Handle closing the camera device when adding shared camera
        executorService.execute(() -> {
          try {
            if (mSession != null) { // Double check as it could be removed by another call
              log("Closing session.");
              mSession.close();
              mSession = null;
              log("Session closed.");
            }
            setState(VpsState.NOT_SETUP);
            promise.resolve(true);
          } catch (Exception e) {
            // It's possible mSession became null between the outer check and here
            // or another error occurred during close.
            if (mSession != null) {
              log("closeAR failed during async close. " + e.getMessage());
              promise.resolve("ERROR_ARCORE_CLOSE_ERROR");
            } else {
              log("Session was already null during async close.");
              setState(VpsState.NOT_SETUP);
              promise.resolve(true);
            }
          }
        });
      } catch (Exception e) {
        // Catch exceptions from mSession.pause()
        log("closeAR failed during pause. " + e.getMessage());
        promise.resolve("ERROR_ARCORE_PAUSE_ERROR");
      }
    } else {
      log("closeAR called but session was already null.");
      setState(VpsState.NOT_SETUP);
      promise.resolve(true);
    }
  }

  @Override
  public void invalidate() {
    log("invalidate called. Cleaning up resources.");
    isPollingVpsState = false;
    if (!executorService.isShutdown()) {
      log("Shutting down executor service.");
      executorService.shutdown();
    }
    // Ensure mSession is also closed if the catalyst instance is destroyed
    // This is a fallback, ideally closeAR would be called explicitly.
    if (mSession != null) {
      try {
        mSession.pause(); // Pause should be on the main thread or ARCore's thread
        // The close operation itself can still be offloaded if it's blocking
        ExecutorService localExecutor = Executors.newSingleThreadExecutor();
        localExecutor.execute(() -> {
          if (mSession != null) {
            log("Closing session in invalidate.");
            mSession.close();
            mSession = null;
          }
        });
        localExecutor.shutdown(); // Shutdown this temporary executor
      } catch (Exception e) {
        // Log error, but don't crash the app during cleanup
        log("Error during AR session cleanup on catalyst destroy: " + e.getMessage());
        Log.e("CLEANUP_ERROR", "Error during AR session cleanup on catalyst destroy: " + e.getMessage());
      }
    }
  }

  private void pollVpsState() {
    log("pollVpsState thread started.");
    while (isPollingVpsState) {
      if (mSession != null) {
        try {
          Frame frame = mSession.update();
          // Getting the camera might be necessary for ARCore to update its internal
          // state.
          frame.getCamera();

          Earth earth = mSession.getEarth();
          if (earth != null) {
            updateGeospatialState(earth);
          } else {
            log("pollVpsState: mSession.getEarth() is null. Waiting...");
          }
        } catch (CameraNotAvailableException e) {
          log("pollVpsState: Camera not available, stopping polling. " + e.getMessage());
          setState(VpsState.CAMERA_NOT_AVAILABLE);
          isPollingVpsState = false;
          return;
        } catch (Throwable t) {
          log("pollVpsState: Unexpected error in mSession.update(), stopping polling. " + t.getMessage());
          Log.e(NAME, "pollVpsState: Unexpected error in mSession.update()", t);
          setState(VpsState.FATAL_UPDATE_ERROR);
          isPollingVpsState = false;
          return;
        }
      } else {
        log("pollVpsState: mSession is null. Disabling poll thread and resetting state.");
        setState(VpsState.NOT_SETUP); // If session is null, reset state
        isPollingVpsState = false; // Stop polling if session is not available
        return; // Exit the loop if session is not available
      }
      try {
        // Poll at a reasonable rate, e.g., 10 times per second.
        Thread.sleep(100);
      } catch (InterruptedException e) {
        log("pollVpsState thread interrupted.");
        Thread.currentThread().interrupt();
        isPollingVpsState = false;
      }
    }
    log("pollVpsState thread finished.");
  }

  private void updateGeospatialState(Earth earth) {
    Earth.EarthState earthState = earth.getEarthState();
    TrackingState earthTrackingState = earth.getTrackingState();
    log("Polling. EarthState: " + earthState.toString() + ", TrackingState: " + earthTrackingState.toString()
        + ", VpsState: " + vpsState.toString());

    if (earthState != Earth.EarthState.ENABLED) {
      log("Earth state is not ENABLED (" + earthState.toString()
          + "). Setting state to EARTH_STATE_ERROR and stopping polling.");
      setState(VpsState.EARTH_STATE_ERROR);
      isPollingVpsState = false; // Stop polling on error
      return;
    }

    if (earthTrackingState == TrackingState.TRACKING) {
      // If we were pre-tracking, we are now tracking.
      if (vpsState == VpsState.PRETRACKING) {
        setState(VpsState.TRACKING);
        log("Earth started tracking. New vpsState: TRACKING");
      }
    } else { // PAUSED or STOPPED
      // If we were tracking, we are now back to pre-tracking.
      if (vpsState == VpsState.TRACKING) {
        setState(VpsState.READY_TO_TRACK);
        log("Earth stopped tracking. New vpsState: READY_TO_TRACK");
      }
    }
  }
}