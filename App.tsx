import React from 'react';
import {SafeAreaView, StyleSheet, Text, Button} from 'react-native';

import NativeLocalStorage, {GeospatialPose} from './specs/NativeLocalStorage';

function App(): React.JSX.Element {
  const [arStatus, setArStatus] = React.useState<string>('AR not setup');
  const [vpsStatus, setVpsStatus] = React.useState<string>('VPS not checked');
  const [pose, setPose] = React.useState<GeospatialPose | null>(null);
  const [poseError, setPoseError] = React.useState<string | null>(null);

  async function setupAR() {
    try {
      setArStatus('Setting up AR...');
      const result = await NativeLocalStorage?.setupAR();
      if (result) {
        setArStatus('AR Session created successfully.');
      } else {
        setArStatus(
          'ARCore installation requested. Please follow prompts and restart app.',
        );
      }
    } catch (e: any) {
      setArStatus(`AR setup failed: ${e.message}`);
      console.error(JSON.stringify(e, null, 2));
    }
  }

  function closeAR() {
    NativeLocalStorage?.closeAR();
    setArStatus('AR Session closed.');
    setPose(null);
    setPoseError(null);
  }

  async function checkVps() {
    try {
      setVpsStatus('Checking VPS availability...');
      // Googleplex coordinates
      const latitude = 37.422;
      const longitude = -122.0841;
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

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>{arStatus}</Text>
      <Button title="Setup AR" onPress={setupAR} />
      <Button title="Close AR" onPress={closeAR} />
      <Text style={styles.text}>{vpsStatus}</Text>
      <Button title="Check VPS Availability" onPress={checkVps} />
      <Button title="Get Geospatial Pose" onPress={getPose} />
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
      {poseError && <Text style={styles.text}>{poseError}</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  text: {
    margin: 10,
    fontSize: 20,
  },
});

export default App;
