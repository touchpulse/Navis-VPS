import type { Spec } from "./NativeVisualPositioningSystem";

const mock: Spec = {
  printMsg: (message: string) => {
    console.warn(
      `[react-native-visual-positioning-system] printMsg("${message}") is a no-op in the Node.js environment.`
    );
  },
  // TurboModule methods
  getConstants: () => ({}),
};

export default mock;
