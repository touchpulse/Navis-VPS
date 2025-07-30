package com.visualpositioningsystem;

import android.util.Log;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.visualpositioningsystem.NativeVisualPositioningSystemSpec;

public class VisualPositioningSystemModule extends NativeVisualPositioningSystemSpec {

  public static String NAME = "VisualPositioningSystem";

  VisualPositioningSystemModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  @Override
  public void printMsg() {
    Log.d(NAME, "This is a message from the demo package");
  }
}
