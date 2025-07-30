import { TurboModule, TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  printMsg(message: string): void;
}

export default TurboModuleRegistry.get<Spec>(
  "VisualPositioningSystem"
) as Spec | null;
