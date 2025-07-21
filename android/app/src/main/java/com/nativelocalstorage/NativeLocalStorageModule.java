package com.nativelocalstorage;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import com.nativelocalstorage.NativeLocalStorageSpec;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;
import com.google.ar.core.exceptions.*;

public class NativeLocalStorageModule extends NativeLocalStorageSpec {

  public static final String NAME = "NativeLocalStorage";
  private static final String TAG = "NativeLocalStorageModule";
  private static final int CAMERA_PERMISSION_CODE = 0;

  private Session mSession;
  private boolean mUserRequestedInstall = true;

  public NativeLocalStorageModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

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

    // Request camera permission. For a real app, the result should be handled.
    if (ContextCompat.checkSelfPermission(currentActivity,
        Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(currentActivity, new String[] { Manifest.permission.CAMERA },
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

        // If we get here, ARCore is installed.
        mSession = new Session(getReactApplicationContext());
        Config config = new Config(mSession);
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
      promise.reject("E_ARCORE_SECURITY_ERROR", "Camera permission is required to use ARCore.", e);
    }
  }

  @ReactMethod
  public void closeAR() {
    if (mSession != null) {
      mSession.close();
      mSession = null;
    }
  }
}