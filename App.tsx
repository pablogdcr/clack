import { StatusBar } from 'expo-status-bar';
import { LogBox, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TypewriterScreen } from './src/screens/TypewriterScreen';

// no LogBox toasts over the machine while recording demos
LogBox.ignoreAllLogs();

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <TypewriterScreen />
      <StatusBar hidden />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0b0a',
  },
});
