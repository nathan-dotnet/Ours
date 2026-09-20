import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

/** Same brand blue as app.json's native splash (`expo-splash-screen` plugin) and the Android
 * adaptive icon background — kept identical so this view is indistinguishable from the native
 * splash it hands off from, with no visible seam or flash of a different shade. */
const BRAND_BLUE = '#2268E5';

/**
 * The JS-rendered continuation of the native splash screen — shown for exactly as long as
 * `app/_layout.tsx` is still awaiting `getDatabase()`/`hydrate()`, never on a fixed timer. Reuses
 * the same `assets/icon.png` mark the native splash (and the app icon) already use, so there is
 * nothing new to design or generate — see app.json's `expo-splash-screen` plugin config.
 */
export function BrandedSplash() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    // A quiet settle-in, not an intro to sit through — the native splash has already been showing
    // this same mark, so this only needs to feel continuous, not announce itself.
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, opacity, scale]);

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: BRAND_BLUE }}>
      <StatusBar style="light" />
      <Animated.Image
        source={require('../../assets/icon.png')}
        accessibilityLabel="Ours"
        style={{ width: 140, height: 140, borderRadius: 32, opacity, transform: [{ scale }] }}
        resizeMode="contain"
      />
    </View>
  );
}
