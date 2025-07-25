import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  PermissionsAndroid,
  Platform,
  View,
  TouchableOpacity,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import NativeLocalStorage, {GeospatialPose} from './specs/NativeLocalStorage';

type ArState =
  | 'NOT_SETUP'
  | 'SETTING_UP'
  | 'SETUP_FAILED'
  | 'SETUP_COMPLETE'
  | 'STARTING_TRACKING'
  | 'TRACKING'
  | 'STOPPING_TRACKING'
  | 'CLOSING';

function App(): React.JSX.Element {
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();
  const device = useCameraDevice('back');
  const [arState, setArState] = React.useState<ArState>('NOT_SETUP');
  const [statusMessage, setStatusMessage] = React.useState('AR not setup.');
  const [vpsStatus, setVpsStatus] = React.useState<string>('VPS not checked');
  const [pose, setPose] = React.useState<GeospatialPose | null>(null);
  const [poseError, setPoseError] = React.useState<string | null>(null);
  const [trackingState, setTrackingState] = React.useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const init = async () => {
      await setupAR();
      await startTracking();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const pollTrackingState = async () => {
      if (arState === 'TRACKING') {
        try {
          const state = await NativeLocalStorage?.getTrackingState();
          setTrackingState(state || 'N/A');
        } catch (e: any) {
          console.error('Failed to get tracking state:', e.message);
          setTrackingState('ERROR');
        }
      }
    };

    if (arState === 'TRACKING') {
      intervalId = setInterval(pollTrackingState, 1000); // Poll every second
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [arState]);

  React.useEffect(() => {
    const requestPermissions = async () => {
      const cameraPermission = await requestCameraPermission();

      let locationPermission = true;
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            locationPermission = false;
          }
        } catch (err) {
          console.warn(err);
          setLocationError('Permissions request failed.');
          return false;
        }
      }

      if (cameraPermission && locationPermission) {
        return true;
      } else {
        setLocationError('Location and Camera permissions are required.');
        return false;
      }
    };

    const getLocation = async () => {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        return;
      }

      Geolocation.watchPosition(
        position => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationError(null);
        },
        error => {
          setLocationError(error.message);
          console.log(error.code, error.message);
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    };

    getLocation();
  }, [requestCameraPermission]);

  async function setupAR() {
    setArState('SETTING_UP');
    setStatusMessage('Setting up AR...');
    try {
      const result = await NativeLocalStorage?.setupAR();
      if (result) {
        setStatusMessage('AR Session created successfully.');
        setArState('SETUP_COMPLETE');
      } else {
        setStatusMessage(
          'ARCore installation requested. Please follow prompts and restart app.',
        );
        setArState('NOT_SETUP');
      }
    } catch (e: any) {
      setStatusMessage(`AR setup failed: ${e.message}`);
      setArState('SETUP_FAILED');
      console.error(JSON.stringify(e, null, 2));
    }
  }

  async function startTracking() {
    if (arState !== 'SETUP_COMPLETE') {
      return;
    }
    setArState('STARTING_TRACKING');
    setStatusMessage('Starting AR tracking...');
    try {
      await NativeLocalStorage?.startTracking();
      setStatusMessage('AR tracking started.');
      setArState('TRACKING');
    } catch (e: any) {
      setStatusMessage(`Failed to start tracking: ${e.message}`);
      setArState('SETUP_COMPLETE'); // Revert to previous state
      console.error(JSON.stringify(e, null, 2));
    }
  }

  async function stopTracking() {
    if (arState !== 'TRACKING') {
      return;
    }
    setArState('STOPPING_TRACKING');
    setStatusMessage('Stopping AR tracking...');
    try {
      await NativeLocalStorage?.stopTracking();
      setStatusMessage('AR tracking stopped.');
      setArState('SETUP_COMPLETE');
      setPose(null);
      setPoseError(null);
      setTrackingState(null);
    } catch (e: any) {
      setStatusMessage(`Failed to stop tracking: ${e.message}`);
      setArState('TRACKING'); // Revert to previous state
      console.error(JSON.stringify(e, null, 2));
    }
  }

  async function closeAR() {
    setArState('CLOSING');
    setStatusMessage('Closing AR Session...');
    await NativeLocalStorage?.closeAR();
    setStatusMessage('AR Session closed.');
    setArState('NOT_SETUP');
    setPose(null);
    setPoseError(null);
    setVpsStatus('VPS not checked');
    setTrackingState(null);
  }

  async function checkVps() {
    if (!currentLocation) {
      setVpsStatus('Could not get current location to check VPS.');
      return;
    }
    try {
      setVpsStatus('Checking VPS availability...');
      const {latitude, longitude} = currentLocation;
      const result = await NativeLocalStorage?.checkVpsAvailability(
        latitude,
        longitude,
      );
      setVpsStatus(`VPS Availability: ${result ? 'Available' : 'Unavailable'}`);
    } catch (e: any) {
      setVpsStatus(`VPS check failed: ${e.message}`);
      console.error(JSON.stringify(e, null, 2));
    }
  }

  async function getPose() {
    try {
      const newPose = await NativeLocalStorage?.getCameraGeospatialPose();
      setPose(newPose || null);
      setPoseError(null);
    } catch (e: any) {
      setPose(null);
      setPoseError(`Pose error: ${e.message}`);
      console.error(JSON.stringify(e, null, 2));
    }
  }

  const canSetup = arState === 'NOT_SETUP' || arState === 'SETUP_FAILED';
  const canStartTracking = arState === 'SETUP_COMPLETE';
  const canStopTracking = arState === 'TRACKING';
  const canClose = arState === 'SETUP_COMPLETE' || arState === 'TRACKING';
  const canCheckVps = arState === 'TRACKING' && !!currentLocation;
  const canGetPose = arState === 'TRACKING';

  const isCameraActive = ![
    'STARTING_TRACKING',
    'TRACKING',
    'STOPPING_TRACKING',
    'CLOSING',
  ].includes(arState);

  if (device == null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.overlay}>
          <Text style={styles.errorText}>No camera device found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {hasCameraPermission && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isCameraActive}
        />
      )}
      {/* Assuming a full-screen camera view is rendered natively in the background */}
      <View style={styles.overlay}>
        <View style={styles.topContainer}>
          <Text style={styles.statusText}>{statusMessage}</Text>
          {trackingState && (
            <Text style={styles.statusText}>
              Tracking State: {trackingState}
            </Text>
          )}
          {locationError && (
            <Text style={styles.errorText}>{locationError}</Text>
          )}
        </View>

        <View style={styles.bottomContainer}>
          <View style={styles.dataContainer}>
            {currentLocation ? (
              <>
                <Text style={styles.dataTitle}>Current GPS Location</Text>
                <Text style={styles.dataText}>
                  Latitude: {currentLocation.latitude.toFixed(6)}
                </Text>
                <Text style={styles.dataText}>
                  Longitude: {currentLocation.longitude.toFixed(6)}
                </Text>
              </>
            ) : (
              <Text style={styles.errorText}>Fetching current location...</Text>
            )}
          </View>

          <View style={styles.dataContainer}>
            <Text style={styles.dataTitle}>{vpsStatus}</Text>
            {pose && (
              <>
                <Text style={styles.dataTitle}>Geospatial Pose</Text>
                <Text style={styles.dataText}>
                  Latitude: {pose.latitude.toFixed(6)}
                </Text>
                <Text style={styles.dataText}>
                  Longitude: {pose.longitude.toFixed(6)}
                </Text>
                <Text style={styles.dataText}>
                  Altitude: {pose.altitude.toFixed(2)}
                </Text>
                <Text style={styles.dataText}>
                  Yaw Accuracy: {pose.orientationYawAccuracy.toFixed(2)}
                </Text>
              </>
            )}
            {poseError && <Text style={styles.errorText}>{poseError}</Text>}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, !canSetup && styles.disabledButton]}
              onPress={setupAR}
              disabled={!canSetup}>
              <Text style={styles.buttonText}>Setup AR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                !canStartTracking && styles.disabledButton,
              ]}
              onPress={startTracking}
              disabled={!canStartTracking}>
              <Text style={styles.buttonText}>Start Tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, !canCheckVps && styles.disabledButton]}
              onPress={checkVps}
              disabled={!canCheckVps}>
              <Text style={styles.buttonText}>Check VPS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, !canGetPose && styles.disabledButton]}
              onPress={getPose}
              disabled={!canGetPose}>
              <Text style={styles.buttonText}>Get Pose</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, !canStopTracking && styles.disabledButton]}
              onPress={stopTracking}
              disabled={!canStopTracking}>
              <Text style={styles.buttonText}>Stop Tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, !canClose && styles.disabledButton]}
              onPress={closeAR}
              disabled={!canClose}>
              <Text style={styles.buttonText}>Close AR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // To see camera view behind
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 40, // Extra padding for status bar area
  },
  topContainer: {
    // For status messages at the top
  },
  bottomContainer: {
    // For controls and data at the bottom
  },
  dataContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  dataTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  dataText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: {
    marginVertical: 5,
    fontSize: 14,
    textAlign: 'center',
    color: '#FF3B30',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 8,
    borderRadius: 10,
  },
});

export default App;
