package com.nativelocalstorage;

import android.app.Activity;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;

import android.Manifest;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Earth;
import com.google.ar.core.GeospatialPose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.*;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NativeLocalStorageModule extends NativeLocalStorageSpec {

  public static final String NAME = "NativeLocalStorage";
  private static final int CAMERA_PERMISSION_CODE = 0;

  private Session mSession;
  private boolean mUserRequestedInstall = true;
  private final ExecutorService executorService = Executors.newSingleThreadExecutor();

  public NativeLocalStorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void setupAR(Promise promise) {
    Activity currentActivity = getCurrentActivity();
    if (currentActivity == null) {
      promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity doesn't exist");
      return;
    }

    // Request camera and location permissions. For a real app, the result should be
    // handled.
    if (ContextCompat.checkSelfPermission(currentActivity,
        Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(currentActivity,
            Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(currentActivity,
          new String[] { Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION },
          CAMERA_PERMISSION_CODE);
    }

    try {
      if (mSession == null) {
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getReactApplicationContext());
        if (!availability.isSupported()) {
          promise.reject("E_ARCORE_NOT_SUPPORTED", "ARCore is not supported on this device.");
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

        mSession = new Session(getReactApplicationContext());

        // Check if Geospatial is supported.
        boolean supported = mSession.isGeospatialModeSupported(Config.GeospatialMode.ENABLED);
        if (!supported) {
          promise.reject("E_GEOSPATIAL_NOT_SUPPORTED",
              "Geospatial API is not supported on this device.");
          mSession.close();
          mSession = null;
          return;
        }

        Config config = mSession.getConfig();
        config.setGeospatialMode(Config.GeospatialMode.ENABLED);
        mSession.configure(config);
      }
      promise.resolve(true);
    } catch (UnavailableUserDeclinedInstallationException e) {
      promise.reject("E_ARCORE_INSTALL_DECLINED", "User declined ARCore installation.", e);
    } catch (UnavailableArcoreNotInstalledException e) {
      promise.reject("E_ARCORE_NOT_INSTALLED", "ARCore is not installed on this device.", e);
    } catch (UnavailableDeviceNotCompatibleException e) {
      promise.reject("E_ARCORE_NOT_COMPATIBLE", "Device is not compatible with ARCore.", e);
    } catch (UnavailableApkTooOldException e) {
      promise.reject("E_ARCORE_APK_TOO_OLD", "ARCore APK is too old.", e);
    } catch (UnavailableSdkTooOldException e) {
      promise.reject("E_ARCORE_SDK_TOO_OLD", "ARCore SDK is too old.", e);
    } catch (FatalException e) {
      promise.reject("E_ARCORE_FATAL_ERROR", "Fatal error occurred while setting up ARCore.", e);
    } catch (SecurityException e) {
      promise.reject("E_ARCORE_SECURITY_ERROR",
          "Camera and/or location permission is required to use ARCore with Geospatial.", e);
    }
  }

  @ReactMethod
  public void getCameraGeospatialPose(Promise promise) {
    if (mSession == null) {
      promise.reject("E_SESSION_NOT_INITIALIZED", "AR session is not initialized. Call setupAR first.");
      return;
    }

    Earth earth = mSession.getEarth();
    if (earth == null) {
      promise.reject("E_EARTH_NOT_AVAILABLE", "Earth object not available. Is Geospatial mode enabled?");
      return;
    }

    if (earth.getTrackingState() == TrackingState.TRACKING) {
      GeospatialPose cameraGeospatialPose = earth.getCameraGeospatialPose();
      WritableMap poseMap = Arguments.createMap();
      poseMap.putDouble("latitude", cameraGeospatialPose.getLatitude());
      poseMap.putDouble("longitude", cameraGeospatialPose.getLongitude());
      poseMap.putDouble("altitude", cameraGeospatialPose.getAltitude());

      float[] quaternion = cameraGeospatialPose.getEastUpSouthQuaternion();
      WritableArray quaternionArray = Arguments.createArray();
      for (float v : quaternion) {
        quaternionArray.pushDouble(v);
      }
      poseMap.putArray("quaternion", quaternionArray);

      poseMap.putDouble("orientationYawAccuracy", cameraGeospatialPose.getOrientationYawAccuracy());

      promise.resolve(poseMap);
    } else {
      TrackingState trackingState = earth.getTrackingState();
      Earth.EarthState earthState = earth.getEarthState();
      promise.reject("E_NOT_TRACKING",
          "Not tracking. Tracking state: " + trackingState + ". Earth state: " + earthState);
    }
  }

  @ReactMethod
  public void checkVpsAvailability(double latitude, double longitude, Promise promise) {
    if (mSession == null) {
      promise.reject("E_SESSION_NOT_INITIALIZED", "AR session is not initialized. Call setupAR first.");
      return;
    }

    mSession.checkVpsAvailabilityAsync(latitude, longitude, (result) -> {
      switch (result) {
        case AVAILABLE:
          promise.resolve(true);
          break;
        case UNAVAILABLE:
          promise.resolve(false);
          break;
        case ERROR_INTERNAL:
          promise.reject("E_VPS_INTERNAL_ERROR", "An internal error occurred while determining VPS availability.");
          break;
        case ERROR_NETWORK_CONNECTION:
          promise.reject("E_VPS_NETWORK_ERROR",
              "The external service could not be reached due to a network connection error.");
          break;
        case ERROR_NOT_AUTHORIZED:
          promise.reject("E_VPS_NOT_AUTHORIZED",
              "An authorization error occurred. Check ARCore API key and configuration.");
          break;
        case ERROR_RESOURCE_EXHAUSTED:
          promise.reject("E_VPS_RESOURCE_EXHAUSTED", "Too many requests were sent for VPS availability check.");
          break;
        case UNKNOWN:
          promise.reject("E_VPS_UNKNOWN", "VPS availability is unknown as the request has not completed.");
          break;
      }
    });
  }

  @ReactMethod
  public void closeAR(Promise promise) {
    if (mSession != null) {
      try {
        mSession.pause();
        // Run session close on a separate thread
        executorService.execute(() -> {
          try {
            if (mSession != null) { // Double check as it could be removed by another call
              mSession.close();
              mSession = null;
            }
            promise.resolve(true);
          } catch (Exception e) {
            // It's possible mSession became null between the outer check and here
            // or another error occurred during close.
            if (mSession != null) {
              promise.reject("E_ARCORE_CLOSE_ERROR", "Error closing AR session: " + e.getMessage(), e);
            }
            promise.resolve(true);
          }
        });
      } catch (Exception e) {
        // Catch exceptions from mSession.pause()
        promise.reject("E_ARCORE_PAUSE_ERROR", "Error pausing AR session: " + e.getMessage(), e);
      }
    } else {
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
        System.err.println("Error during AR session cleanup on catalyst destroy: " + e.getMessage());
      }
    }
  }
}