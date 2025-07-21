import React from 'react';
import {SafeAreaView, StyleSheet, Text, Button} from 'react-native';

import NativeLocalStorage from './specs/NativeLocalStorage';

function App(): React.JSX.Element {
  const [arStatus, setArStatus] = React.useState<string>('AR not setup');

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
    }
  }

  function closeAR() {
    NativeLocalStorage?.closeAR();
    setArStatus('AR Session closed.');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.text}>{arStatus}</Text>
      <Button title="Setup AR" onPress={setupAR} />
      <Button title="Close AR" onPress={closeAR} />
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
