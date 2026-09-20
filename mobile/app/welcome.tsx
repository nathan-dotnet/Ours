import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';

/**
 * The very first thing a brand-new (or fully logged-out) user sees — see app/_layout.tsx for why
 * this is a separate top-level route rather than folded into `(auth)`: a restored session that's
 * only waiting on the biometric gate must still land straight on Login, not here.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
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
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, opacity, translateY]);

  return (
    <Screen>
      {/* collapsable={false}: without it, Android's view-flattening optimization (most
          aggressive in a release/EAS build, which is why this didn't show up in dev) can merge
          this natively-driven Animated.View into its parent, detaching the animation from the
          real touch-hit-test tree and silently swallowing taps on the buttons below. */}
      <Animated.View
        collapsable={false}
        className="flex-1 items-center justify-center gap-10"
        style={{ opacity, transform: [{ translateY }] }}
      >
        <Image
          source={require('../assets/Ours.png')}
          accessibilityLabel="Ours"
          style={{ width: 116, height: 116 }}
          resizeMode="contain"
        />

        <View className="items-center gap-2">
          <Text className="text-3xl font-semibold text-ink">Money, together.</Text>
          <Text className="max-w-xs text-center text-base text-clay">
            A shared space to plan, save, and grow your future — just the two of you.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Button label="Get Started" onPress={() => router.push('/(auth)/register')} />
          <Button label="I already have an account" variant="secondary" onPress={() => router.push('/(auth)/login')} />
        </View>
      </Animated.View>
    </Screen>
  );
}
