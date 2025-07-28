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

  // State management
  private enum VpsState {
    NOT_SETUP,
    SETTING_UP,
    SETUP_FAILED,
    UNSUPPORTED,
    READY_TO_TRACK,
    PRETRACKING,
    TRACKING,
    STOPPED,
    EARTH_STATE_ERROR
  }

  private VpsState vpsState = VpsState.NOT_SETUP;

  private Session mSession;
  private boolean mUserRequestedInstall = true;
  private final ExecutorService executorService = Executors.newSingleThreadExecutor();

  public NativeLocalStorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  private void setState(VpsState newState) {
    if (this.vpsState == newState) {
      return; // No change, no event.
    }
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
    setState(VpsState.SETTING_UP);
    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ACTIVITY_DOES_NOT_EXIST");
      return;
    }

    // Permissions should be requested from the JS side before calling this method.
    // The SecurityException catch block below will handle cases where permissions
    // are missing.

    try {
      if (mSession == null) {
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getReactApplicationContext());
        if (!availability.isSupported()) {
          setState(VpsState.UNSUPPORTED);
          promise.resolve("ERROR_ARCORE_NOT_SUPPORTED");
          return;
        }

        // Request installation of Google Play Services for AR if needed.
        ArCoreApk.InstallStatus installStatus = ArCoreApk.getInstance().requestInstall(currentActivity,
            mUserRequestedInstall);
        if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
          mUserRequestedInstall = false;
          promise.resolve(false); // Indicate installation is in progress.
          return;
        }

        mSession = new Session(getReactApplicationContext(), EnumSet.of(Session.Feature.SHARED_CAMERA));

        // Check if Geospatial is supported.
        boolean supported = mSession.isGeospatialModeSupported(Config.GeospatialMode.ENABLED);
        if (!supported) {
          setState(VpsState.UNSUPPORTED);
          promise.resolve("ERROR_GEOSPATIAL_NOT_SUPPORTED");
          mSession.close();
          mSession = null;
          return;
        }

        Config config = mSession.getConfig();
        config.setGeospatialMode(Config.GeospatialMode.ENABLED);
        mSession.configure(config);
      }
      setState(VpsState.READY_TO_TRACK);
      promise.resolve(true);
    } catch (UnavailableUserDeclinedInstallationException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_INSTALL_DECLINED");
    } catch (UnavailableArcoreNotInstalledException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_NOT_INSTALLED");
    } catch (UnavailableDeviceNotCompatibleException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_NOT_COMPATIBLE");
    } catch (UnavailableApkTooOldException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_APK_TOO_OLD");
    } catch (UnavailableSdkTooOldException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_SDK_TOO_OLD");
    } catch (FatalException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_FATAL_ERROR");
    } catch (SecurityException e) {
      setState(VpsState.SETUP_FAILED);
      promise.resolve("ERROR_ARCORE_SECURITY_ERROR");
    }
  }

  @ReactMethod
  public void startTracking(Promise promise) {
    if (mSession == null) {
      promise.resolve("ERROR_SESSION_NOT_INITIALIZED");
      return;
    }

    if (vpsState != VpsState.READY_TO_TRACK) {
      promise.resolve("ERROR_SESSION_NOT_READY");
      return;
    }

    try {
      mSession.resume();
      setState(VpsState.PRETRACKING);

      promise.resolve(true);
    } catch (SessionNotPausedException e) {
      promise.resolve("ERROR_SESSION_NOT_PAUSED");
    } catch (CameraNotAvailableException e) {
      promise.resolve("ERROR_CAMERA_NOT_AVAILABLE");
    } catch (SecurityException e) {
      promise.resolve("ERROR_CAMERA_PERMISSION_NOT_GRANTED");
    } catch (IllegalStateException e) {
      promise.resolve("ERROR_ILLEGAL_STATE");
    } catch (UnsupportedConfigurationException e) {
      promise.resolve("ERROR_UNSUPPORTED_CONFIGURATION");
    } catch (FatalException e) {
      promise.resolve("ERROR_FATAL");
    }
  }

  @ReactMethod
  public boolean stopTracking() {
    if (mSession == null) {
      return false;
    }

    mSession.pause();
    setState(VpsState.STOPPED);
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
    if (mSession == null) {
      promise.resolve("ERROR_SESSION_NOT_INITIALIZED");
      return;
    }

    try {
      mSession.checkVpsAvailabilityAsync(latitude, longitude, promise::resolve);
    } catch (SecurityException e) {
      promise.resolve("ERROR_INTERNET_PERMISSION_NOT_GRANTED");
    }
  }

  @ReactMethod
  public void closeAR(Promise promise) {
    if (mSession != null) {
      try {
        mSession.pause();
        // Run session close on a separate thread
        // TODO: Handle closing the camera device when adding shared camera
        executorService.execute(() -> {
          try {
            if (mSession != null) { // Double check as it could be removed by another call
              mSession.close();
              mSession = null;
            }
            setState(VpsState.NOT_SETUP);
            promise.resolve(true);
          } catch (Exception e) {
            // It's possible mSession became null between the outer check and here
            // or another error occurred during close.
            if (mSession != null) {
              promise.resolve("ERROR_ARCORE_CLOSE_ERROR");
            } else {
              setState(VpsState.NOT_SETUP);
              promise.resolve(true);
            }
          }
        });
      } catch (Exception e) {
        // Catch exceptions from mSession.pause()
        promise.resolve("ERROR_ARCORE_PAUSE_ERROR");
      }
    } else {
      setState(VpsState.NOT_SETUP);
      promise.resolve(true);
    }
  }

  @Override
  public void invalidate() {
    if (!executorService.isShutdown()) {
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
            mSession.close();
            mSession = null;
          }
        });
        localExecutor.shutdown(); // Shutdown this temporary executor
      } catch (Exception e) {
        // Log error, but don't crash the app during cleanup
        Log.e("CLEANUP_ERROR", "Error during AR session cleanup on catalyst destroy: " + e.getMessage());
      }
    }
  }
}