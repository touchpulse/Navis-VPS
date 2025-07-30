import { TurboModule, TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  printMsg(): void;
}

export default TurboModuleRegistry.get<Spec>(
  "VisualPositioningSystem"
) as Spec | null;
