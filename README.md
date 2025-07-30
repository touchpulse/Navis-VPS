# React Native Visual Positioning System

A Turbo Native Module for Google's Visual Positioning System.

## Installation

```sh
npm install react-native-visual-positioning-system
# or
yarn add react-native-visual-positioning-system
```

Then, for iOS, you need to install the pods:

```sh
cd ios
RCT_NEW_ARCH_ENABLED=1 bundle exec pod install
```

For Android, you need to enable the New Architecture by setting
`newArchEnabled=true` in your `android/gradle.properties` file.

## Usage

```javascript
import VisualPositioningSystem from "react-native-visual-positioning-system";

// ...

VisualPositioningSystem?.printMsg();
```
