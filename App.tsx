import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Linking,
} from 'react-native';
import MapView, {Marker} from 'react-native-maps';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import NativeLocalStorage, {
  addVpsStateListener,
  addVpsLogListener,
  VpsState,
  GeospatialPose,
  VpsAvailability,
  SetupARErrors,
  CloseARErrors,
  GeospatialTrackingStartErrors,
  VpsAvailaibilityErrors,
  GeospatialPoseErrors,
} from './specs/NativeLocalStorage';

// Helper to check if a value is an error enum
function isError<T extends object>(
  value: any,
  errorEnum: T,
): value is T[keyof T] {
  return Object.values(errorEnum).includes(value);
}

const App = () => {
  // Permissions
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  // State
  const [vpsState, setVpsState] = useState<VpsState>(VpsState.NOT_SETUP);
  const [vpsPose, setVpsPose] = useState<GeospatialPose | null>(null);
  const [lastPoseUpdate, setLastPoseUpdate] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<number | null>(
    null,
  );
  const [vpsAvailability, setVpsAvailability] =
    useState<VpsAvailability | null>(null);
  const [lastVpsUpdate, setLastVpsUpdate] = useState<number | null>(null);
  const AVAILABILITY_CHECK_INTERVAL = 5000; // 5 seconds
  const [lastAvailabilityCheck, setLastAvailabilityCheck] = useState<
    number | null
  >(null);
  const [isPoseAccurate, setIsPoseAccurate] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const device = useCameraDevice('back');
  const locationWatchId = useRef<number | null>(null);

  // --- Effects ---

  // Request permissions
  useEffect(() => {
    const requestPermissions = async () => {
      console.log('Requesting permissions...');
      if (!hasCameraPermission) {
        console.log('Requesting camera permission...');
        const cameraStatus = await requestCameraPermission();
        console.log('Camera permission status:', cameraStatus);
      }
      if (Platform.OS === 'android') {
        console.log('Requesting location permission for Android...');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location for VPS.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Location permission granted for Android.');
          setHasLocationPermission(true);
        } else {
          console.log('Location permission denied for Android.');
        }
      } else {
        // On iOS, Geolocation requests permission automatically.
        console.log(
          'Setting location permission to true for iOS (permission will be requested by Geolocation).',
        );
        setHasLocationPermission(true);
      }
    };
    requestPermissions();
  }, [hasCameraPermission, requestCameraPermission]);

  // Update time for UI refresh
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 500);
    return () => clearInterval(intervalId);
  }, []);

  // Native Log Listener
  useEffect(() => {
    console.log('Setting up native log listener...');
    const subscription = addVpsLogListener(message => {
      console.log(`[Native] ${message}`);
    });

    return () => {
      console.log('Removing native log listener.');
      subscription.remove();
    };
  }, []);

  // VPS State Listener
  useEffect(() => {
    const initialVpsState = NativeLocalStorage.getVpsState();
    console.log('Initial VPS State:', initialVpsState);
    setVpsState(initialVpsState);

    const subscription = addVpsStateListener(newVpsState => {
      console.log('VPS State changed:', newVpsState);
      setVpsState(newVpsState);
    });

    return () => {
      console.log('Removing VPS state listener.');
      subscription.remove();
    };
  }, []);

  // Location Watcher
  useEffect(() => {
    if (hasLocationPermission) {
      console.log('Starting location watcher.');
      locationWatchId.current = Geolocation.watchPosition(
        position => {
          console.log('New location received:', position.coords);
          setUserLocation(position.coords);
          setLastLocationUpdate(Date.now());
        },
        error => console.error('Location Watcher Error:', error),
        {enableHighAccuracy: true, interval: 5000, fastestInterval: 0},
      );
    }
    return () => {
      if (locationWatchId.current !== null) {
        console.log('Stopping location watcher.');
        Geolocation.clearWatch(locationWatchId.current);
      }
    };
  }, [hasLocationPermission]);

  // VPS Availability Check
  useEffect(() => {
    const checkAvailability = async () => {
      if (
        vpsState === VpsState.READY_TO_TRACK &&
        userLocation &&
        (!lastAvailabilityCheck ||
          Date.now() - lastAvailabilityCheck >= AVAILABILITY_CHECK_INTERVAL)
      ) {
        console.log('Checking VPS availability for location:', userLocation);
        setLastAvailabilityCheck(Date.now());
        const result = await NativeLocalStorage.checkVpsAvailability(
          userLocation.latitude,
          userLocation.longitude,
        );
        console.log('VPS availability check result:', result);
        if (isError(result, VpsAvailaibilityErrors)) {
          console.error(`VPS Availability Error: ${result}`);
          throw new Error(`VPS Availability Error: ${result}`);
        }
        setVpsAvailability(result);
        setLastVpsUpdate(Date.now());
      }
    };
    checkAvailability();
  }, [lastAvailabilityCheck, userLocation, vpsState]);

  // Pose Polling
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (vpsState === VpsState.TRACKING) {
      console.log('Starting pose polling.');
      intervalId = setInterval(async () => {
        console.log('Polling for geospatial pose...');
        const result = await NativeLocalStorage.getCameraGeospatialPose();
        if (isError(result, GeospatialPoseErrors)) {
          console.warn(`Could not get pose: ${result}`);
          setVpsPose(null);
        } else {
          console.log('New pose received:', result);
          setVpsPose(result);
          setLastPoseUpdate(Date.now());
          setIsPoseAccurate(result.horizontalAccuracy < 5);
        }
      }, 1000);
    }
    return () => {
      if (intervalId) {
        console.log('Stopping pose polling.');
        clearInterval(intervalId);
        setVpsPose(null);
      }
    };
  }, [vpsState]);

  // --- Handlers ---

  const handleStartSession = useCallback(async () => {
    console.log('Handling Start Session...');
    const result = await NativeLocalStorage.setupAR();
    console.log('setupAR result:', result);
    if (isError(result, SetupARErrors)) {
      console.error(`Setup AR Error: ${result}`);
      throw new Error(`Setup AR Error: ${result}`);
    }
  }, []);

  const handleStopSession = useCallback(async () => {
    console.log('Handling Stop Session...');
    const result = await NativeLocalStorage.closeAR();
    console.log('closeAR result:', result);
    if (isError(result, CloseARErrors)) {
      console.error(`Close AR Error: ${result}`);
      throw new Error(`Close AR Error: ${result}`);
    }
  }, []);

  const handleStartTracking = useCallback(async () => {
    console.log('Handling Start Tracking...');
    const result = await NativeLocalStorage.startTracking();
    console.log('startTracking result:', result);
    if (isError(result, GeospatialTrackingStartErrors)) {
      console.error(`Start Tracking Error: ${result}`);
      throw new Error(`Start Tracking Error: ${result}`);
    }
  }, []);

  const handleStopTracking = useCallback(() => {
    console.log('Handling Stop Tracking...');
    NativeLocalStorage.stopTracking();
  }, []);

  // --- Render ---

  const renderTimeSince = (timestamp: number | null) => {
    if (timestamp === null) {
      return 'N/A';
    }
    return `${Math.round((currentTime - timestamp) / 1000)}s ago`;
  };

  const isVpsSessionActive = vpsState !== VpsState.NOT_SETUP;

  if (!hasCameraPermission || !hasLocationPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Permissions not granted.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No camera device found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        region={
          userLocation
            ? {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }
            : undefined
        }
        showsUserLocation>
        {vpsPose && (
          <Marker
            coordinate={{
              latitude: vpsPose.latitude,
              longitude: vpsPose.longitude,
            }}
            title="VPS Pose"
            pinColor="blue"
          />
        )}
      </MapView>
      <View style={styles.overlay}>
        <View style={styles.statusContainer}>
          <Text style={styles.text}>VPS State: {vpsState}</Text>
          <Text style={styles.text}>
            User Location:{' '}
            {userLocation
              ? `${userLocation.latitude.toFixed(
                  6,
                )}, ${userLocation.longitude.toFixed(6)}`
              : 'N/A'}{' '}
            ({renderTimeSince(lastLocationUpdate)})
          </Text>
          <Text style={styles.text}>
            VPS Availability: {vpsAvailability ?? 'N/A'} (
            {renderTimeSince(lastVpsUpdate)})
          </Text>
          <View>
            <Text style={styles.text}>
              VPS Pose:{' '}
              {vpsPose
                ? `${vpsPose.latitude.toFixed(6)}, ${vpsPose.longitude.toFixed(
                    6,
                  )}`
                : 'N/A'}{' '}
              ({renderTimeSince(lastPoseUpdate)})
            </Text>
            {vpsPose && (
              <>
                <Text style={styles.text}>
                  {'  '}- H. Accuracy: {vpsPose.horizontalAccuracy.toFixed(2)}m
                </Text>
                {!isPoseAccurate && (
                  <Text style={styles.warningText}>
                    {'  '}- WARNING: Low horizontal accuracy!
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        <View>
          {(vpsState === VpsState.NOT_SETUP ||
            vpsState === VpsState.PRETRACKING) && (
            <View style={styles.cameraContainer}>
              <Camera
                style={styles.cameraPreview}
                device={device}
                isActive={true}
              />
              {vpsState === VpsState.PRETRACKING && (
                <View style={styles.localizingOverlay}>
                  <Text style={styles.localizingText}>Localizing...</Text>
                  <Text style={styles.localizingTextDetail}>
                    Point at buildings and scan your surroundings.
                  </Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.buttonContainer}>
            {vpsState === VpsState.NOT_SETUP && (
              <TouchableOpacity
                style={styles.button}
                onPress={handleStartSession}>
                <Text style={styles.buttonText}>Start Session</Text>
              </TouchableOpacity>
            )}

            {isVpsSessionActive && (
              <TouchableOpacity
                style={[styles.button, styles.stopButton]}
                onPress={handleStopSession}>
                <Text style={styles.buttonText}>Stop Session</Text>
              </TouchableOpacity>
            )}

            {vpsState === VpsState.READY_TO_TRACK && (
              <TouchableOpacity
                style={styles.button}
                onPress={handleStartTracking}>
                <Text style={styles.buttonText}>Start Tracking</Text>
              </TouchableOpacity>
            )}

            {[VpsState.TRACKING, VpsState.PRETRACKING].includes(vpsState) && (
              <TouchableOpacity
                style={[styles.button, styles.stopButton]}
                onPress={handleStopTracking}>
                <Text style={styles.buttonText}>Stop Tracking</Text>
              </TouchableOpacity>
            )}

            {(!userLocation ||
              !lastLocationUpdate ||
              lastLocationUpdate + 10000 < Date.now()) && (
              <TouchableOpacity
                style={styles.button}
                onPress={() => {
                  Geolocation.getCurrentPosition(
                    position => {
                      setUserLocation(position.coords);
                      setLastLocationUpdate(Date.now());
                    },
                    error => console.error('Location Error:', error),
                    {enableHighAccuracy: true, timeout: 15000},
                  );
                }}>
                <Text style={styles.buttonText}>Get Location</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
  },
  statusContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 5,
  },
  text: {
    color: 'white',
    fontSize: 14,
    marginBottom: 4,
  },
  warningText: {
    color: 'yellow',
    fontSize: 14,
  },
  localizingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  localizingText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  localizingTextDetail: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 10,
    marginTop: 8,
  },
  cameraContainer: {
    height: 200,
    marginBottom: 15,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'white',
  },
  cameraPreview: {
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default App;
