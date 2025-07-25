import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface GeospatialPose {
  latitude: number;
  longitude: number;
  altitude: number;
  quaternion: number[];
  orientationYawAccuracy: number;
}

export interface Spec extends TurboModule {
  setupAR(): Promise<boolean>;
  startTracking(): Promise<boolean>;
  stopTracking(): Promise<boolean>;
  closeAR(): Promise<boolean>;
  checkVpsAvailability(latitude: number, longitude: number): Promise<boolean>;
  getCameraGeospatialPose(): Promise<GeospatialPose>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeLocalStorage');
