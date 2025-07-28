import type {TurboModule} from 'react-native';
import {
  TurboModuleRegistry,
  NativeEventEmitter,
  type EmitterSubscription,
} from 'react-native';

/**
 * Describes the current state of the AR session.
 */
export enum VpsState {
  /** The AR session is not set up. Call setupAR first. */
  NOT_SETUP = 'NOT_SETUP',
  /** The AR session is currently being set up. */
  SETTING_UP = 'SETTING_UP',
  /** The AR session failed to set up. */
  SETUP_FAILED = 'SETUP_FAILED',
  /** The AR session is not supported on this device. */
  UNSUPPORTED = 'UNSUPPORTED',
  /** The AR session is ready to track the device's position. */
  READY_TO_TRACK = 'READY_TO_TRACK',
  /** The AR session is starting to track the device's position. */
  PRETRACKING = 'PRETRACKING',
  /** The AR session is currently tracking the device's position. */
  TRACKING = 'TRACKING',
  /** The AR session is stopped. */
  STOPPED = 'STOPPED',
  /** The AR session encountered an error with the Earth state. */
  EARTH_STATE_ERROR = 'EARTH_STATE_ERROR',
}

/**
 * Describes the errors that can occur during the setup of the AR session.
 */
export enum SetupARErrors {
  /** The activity does not exist. This is an internal error. */
  ERROR_ACTIVITY_DOES_NOT_EXIST = 'ERROR_ACTIVITY_DOES_NOT_EXIST',
  /** ARCore is not supported on this device. */
  ERROR_ARCORE_NOT_SUPPORTED = 'ERROR_ARCORE_NOT_SUPPORTED',
  /** Geospatial API is not supported on this device. */
  ERROR_GEOSPATIAL_NOT_SUPPORTED = 'ERROR_GEOSPATIAL_NOT_SUPPORTED',
  /** User declined ARCore installation. */
  ERROR_ARCORE_INSTALL_DECLINED = 'ERROR_ARCORE_INSTALL_DECLINED',
  /** ARCore is not installed on this device. */
  ERROR_ARCORE_NOT_INSTALLED = 'ERROR_ARCORE_NOT_INSTALLED',
  /** Device is not compatible with ARCore. */
  ERROR_ARCORE_NOT_COMPATIBLE = 'ERROR_ARCORE_NOT_COMPATIBLE',
  /** ARCore APK is too old. */
  ERROR_ARCORE_APK_TOO_OLD = 'ERROR_ARCORE_APK_TOO_OLD',
  /** ARCore SDK is too old. */
  ERROR_ARCORE_SDK_TOO_OLD = 'ERROR_ARCORE_SDK_TOO_OLD',
  /** Fatal error occurred while setting up ARCore. */
  ERROR_ARCORE_FATAL_ERROR = 'ERROR_ARCORE_FATAL_ERROR',
  /** Camera and/or location permission is required to use ARCore with Geospatial. */
  ERROR_ARCORE_SECURITY_ERROR = 'ERROR_ARCORE_SECURITY_ERROR',
}

/**
 * Describes the errors that can occur when closing the AR session.
 */
export enum CloseARErrors {
  /** An error occurred while pausing the AR session. */
  ERROR_ARCORE_PAUSE_ERROR = 'ERROR_ARCORE_PAUSE_ERROR',
  /** An error occurred while closing the AR session. */
  ERROR_ARCORE_CLOSE_ERROR = 'ERROR_ARCORE_CLOSE_ERROR',
}

/**
 * Describes the availability of VPS at a certain location.
 */
export enum VpsAvailability {
  /** The request to the remote service is not yet completed, so the availability is not yet known. */
  UNKNOWN = 'UNKNOWN',
  /** VPS is available at the requested location. */
  AVAILABLE = 'AVAILABLE',
  /** VPS is not available at the requested location. */
  UNAVAILABLE = 'UNAVAILABLE',
}

/**
 * Describes the errors that can occur when checking VPS availability.
 */
export enum VpsAvailaibilityErrors {
  /** An internal error occurred while determining availability. */
  ERROR_INTERNAL = 'ERROR_INTERNAL',
  /** The external service could not be reached due to a network connection error. */
  ERROR_NETWORK_CONNECTION = 'ERROR_NETWORK_CONNECTION',
  /**
   * An authorization error occurred when communicating with the Google Cloud ARCore API.
   * See https://developers.google.com/ar/develop/java/geospatial/enable for troubleshooting steps.
   * Most likely, the API key is not configured properly.
   */
  ERROR_NOT_AUTHORIZED = 'ERROR_NOT_AUTHORIZED',
  /** Too many requests were sent. */
  ERROR_RESOURCE_EXHAUSTED = 'ERROR_RESOURCE_EXHAUSTED',
  /** The AR session was not initialized. */
  ERROR_SESSION_NOT_INITIALIZED = 'ERROR_SESSION_NOT_INITIALIZED',
  /** The device does not have the required permissions to access the internet (should not occur on modern devices). */
  ERROR_INTERNET_PERMISSION_NOT_GRANTED = 'ERROR_INTERNET_PERMISSION_NOT_GRANTED',
}

/**
 * Describes the geospatial pose of the camera as returned by VPS.
 */
export interface GeospatialPose {
  latitude: number;
  longitude: number;
  altitude: number;
  quaternion: number[];
  verticalAccuracy: number;
  horizontalAccuracy: number;
  orientationYawAccuracy: number;
}

/**
 * Describes the errors that can occur when retrieving the geospatial pose.
 */
export enum GeospatialPoseErrors {
  /** The AR session is not initialized, so the geospatial pose cannot be retrieved. */
  ERROR_SESSION_NOT_INITIALIZED = 'ERROR_SESSION_NOT_INITIALIZED',
  /** The AR session's Earth object is not available. The developers may have not enabled Geospatial mode...? */
  ERROR_EARTH_NOT_AVAILABLE = 'ERROR_EARTH_NOT_AVAILABLE',
  /** The AR session's Earth object is not tracking. Make sure to call startTracking() */
  ERROR_EARTH_NOT_TRACKING = 'ERROR_EARTH_NOT_TRACKING',
}

/**
 * Describes the errors that can occur when starting geospatial tracking.
 */
export enum GeospatialTrackingStartErrors {
  /** The AR session is not initialized, so tracking cannot be started. */
  ERROR_SESSION_NOT_INITIALIZED = 'ERROR_SESSION_NOT_INITIALIZED',
  /** The AR session is not ready to start tracking. It may be already tracking, or not initialized. */
  ERROR_SESSION_NOT_READY = 'ERROR_SESSION_NOT_READY',
  /** The session was not paused before attempting to resume. */
  ERROR_SESSION_NOT_PAUSED = 'ERROR_SESSION_NOT_PAUSED',
  /** The camera isn't available yet. */
  ERROR_CAMERA_NOT_AVAILABLE = 'ERROR_CAMERA_NOT_AVAILABLE',
  /** The camera permission is not granted. */
  ERROR_CAMERA_PERMISSION_NOT_GRANTED = 'ERROR_CAMERA_PERMISSION_NOT_GRANTED',
  /** There are acquired images still open. */
  ERROR_ILLEGAL_STATE = 'ERROR_ILLEGAL_STATE',
  /** The configuration is not supported on this device. */
  ERROR_UNSUPPORTED_CONFIGURATION = 'ERROR_UNSUPPORTED_CONFIGURATION',
  /** An unrecoverable error occurred. Check the device logs for more details. */
  ERROR_FATAL = 'ERROR_FATAL',
}

export interface Spec extends TurboModule {
  /**
   * Sets up the AR session for geospatial tracking.
   * This method must be called before any other methods related to geospatial tracking.
   * @returns A promise that resolves to true if the setup was successful, false if the user is installing the required services (try again later) or an error code if it failed.
   */
  setupAR(): Promise<boolean | SetupARErrors>;
  /**
   * Starts tracking the device's position using geospatial data.
   * This method must be called after {@linkcode setupAR} and when the AR session is ready.
   * This method must be called before calling {@linkcode getCameraGeospatialPose}.
   * This method will also start the camera if it is not already started.
   * @returns A promise that resolves to true if tracking started successfully, or an error code if it failed.
   */
  startTracking(): Promise<true | GeospatialTrackingStartErrors>;
  /**
   * Stops tracking the device's position.
   * This method will stop the camera if it is currently started.
   * @return Returns true if tracking was stopped successfully, false if it was not started.
   */
  stopTracking(): boolean;
  /**
   * Closes the AR session.
   * This method should be called when the AR session is no longer needed.
   * @returns A promise that resolves to true if the AR session was closed successfully or didn't exist, or an error code if it failed.
   */
  closeAR(): Promise<true | CloseARErrors>;
  /**
   * Checks if VPS is available at the given location.
   * Requires {@linkcode setupAR} to be called first.
   * @param latitude The latitude of the location to check VPS availability for.
   * @param longitude The longitude of the location to check VPS availability for.
   * @returns A promise that resolves to the availability status of VPS at the given location. Only {@linkcode VpsAvailability.AVAILABLE} guarantees that the geospatial pose can be retrieved with {@linkcode getCameraGeospatialPose}.
   */
  checkVpsAvailability(
    latitude: number,
    longitude: number,
  ): Promise<VpsAvailability | VpsAvailaibilityErrors>;
  /**
   * Gets the current geospatial pose of the camera.
   * Requires {@linkcode startTracking} to be called first.
   * @returns A promise that resolves to the current geospatial pose of the camera, or an error code if it failed.
   */
  getCameraGeospatialPose(): Promise<GeospatialPose | GeospatialPoseErrors>;
  /**
   * Gets the current state of the AR session.
   * @returns The current state of the AR session.
   */
  getVpsState(): VpsState;
  /**
   * Adds a listener for VPS state changes.
   * Use with `NativeEventEmitter`. The event is `onVpsStateChange`.
   * @param eventName The name of the event to listen to.
   */
  addListener(eventName: string): void;
  /**
   * Removes listeners.
   * @param count The number of listeners to remove.
   */
  removeListeners(count: number): void;
}

const NativeLocalStorage =
  TurboModuleRegistry.getEnforcing<Spec>('NativeLocalStorage');

const eventEmitter = new NativeEventEmitter(NativeLocalStorage as any);

/**
 * Registers a listener for VPS state changes.
 * @param callback The callback to call when the VPS state changes.
 * @returns An `EmitterSubscription` to unsubscribe the listener.
 */
export function addVpsStateListener(
  callback: (state: VpsState) => void,
): EmitterSubscription {
  return eventEmitter.addListener('onVpsStateChange', callback);
}

export default NativeLocalStorage;
