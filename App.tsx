import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  View,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';

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
  const [arState, setArState] = React.useState<ArState>('NOT_SETUP');
  const [statusMessage, setStatusMessage] = React.useState('AR not setup.');
  const [vpsStatus, setVpsStatus] = React.useState<string>('VPS not checked');
  const [pose, setPose] = React.useState<GeospatialPose | null>(null);
  const [poseError, setPoseError] = React.useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message:
                'This app needs access to your location for AR features.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            },
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
          console.warn(err);
          return false;
        }
      }
      return true;
    };

    const getLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocationError('Location permission denied.');
        return;
      }

      Geolocation.getCurrentPosition(
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
  }, []);

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

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>{statusMessage}</Text>
      {locationError && <Text style={styles.errorText}>{locationError}</Text>}
      <View style={styles.buttonContainer}>
        <Button title="Setup AR" onPress={setupAR} disabled={!canSetup} />
        <Button
          title="Start Tracking"
          onPress={startTracking}
          disabled={!canStartTracking}
        />
        <Button
          title="Stop Tracking"
          onPress={stopTracking}
          disabled={!canStopTracking}
        />
        <Button title="Close AR" onPress={closeAR} disabled={!canClose} />
      </View>
      <Text style={styles.text}>{vpsStatus}</Text>
      <Button
        title="Check VPS at Current Location"
        onPress={checkVps}
        disabled={!canCheckVps}
      />
      <Button
        title="Get Geospatial Pose"
        onPress={getPose}
        disabled={!canGetPose}
      />
      {pose && (
        <>
          <Text style={styles.text}>Latitude: {pose.latitude.toFixed(6)}</Text>
          <Text style={styles.text}>
            Longitude: {pose.longitude.toFixed(6)}
          </Text>
          <Text style={styles.text}>Altitude: {pose.altitude.toFixed(2)}</Text>
          <Text style={styles.text}>
            Yaw Accuracy: {pose.orientationYawAccuracy.toFixed(2)}
          </Text>
        </>
      )}
      {poseError && <Text style={styles.errorText}>{poseError}</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  text: {
    margin: 10,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    margin: 10,
    fontSize: 16,
    textAlign: 'center',
    color: 'red',
  },
});

export default App;
