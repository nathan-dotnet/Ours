import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable } from 'react-native';
import { softRaisedAccent, softRaisedSubtle } from '../styles/neumorphism';

export type MissMeButtonState = 'idle' | 'cooldown' | 'sending' | 'sent';

interface MissMeButtonProps {
  state: MissMeButtonState;
  onPress: () => void;
}

const SIZE = 96;

/**
 * Just the circle — "under the button: miss you" and any cooldown/confirmation text is the
 * caller's job (see app/(tabs)/index.tsx), so this stays a single, small, reusable control
 * instead of growing into the "large card with a paragraph of copy" the spec explicitly rejects.
 *
 * Visual states approximate neumorphism within what React Native's single-shadow View actually
 * supports (see styles/neumorphism.ts): normal is a soft raised shadow, a press swaps to a much
 * fainter one plus a slight scale-down (the closest honest approximation of "inset" without a
 * real inset shadow), and cooldown drops the shadow entirely and dims the heart — "keep the
 * button visible... make it slightly subdued" rather than hiding or disabling it outright.
 */
export function MissMeButton({ state, onPress }: MissMeButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const disabled = state === 'cooldown' || state === 'sending';

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
    if (state !== 'sent' || reduceMotion) return;
    // One quiet pulse, not a bounce loop or anything that keeps drawing attention to itself.
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.12, duration: 140, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [state, reduceMotion, scale]);

  const onPressIn = () => {
    if (disabled) return;
    setIsPressed(true);
    if (!reduceMotion) {
      Animated.timing(scale, { toValue: 0.93, duration: 90, useNativeDriver: true }).start();
    }
  };

  const onPressOut = () => {
    setIsPressed(false);
    if (!reduceMotion) {
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Miss me"
        accessibilityHint={state === 'cooldown' ? "You've already sent this recently" : 'Sends a quiet reminder that you miss your partner'}
        accessibilityState={{ disabled }}
        hitSlop={8}
        style={[
          { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
          disabled ? undefined : isPressed ? softRaisedSubtle : softRaisedAccent,
        ]}
        className={`items-center justify-center rounded-full ${state === 'cooldown' ? 'bg-blush/60' : 'bg-blush'}`}
      >
        <Animated.Text style={{ fontSize: 32, opacity: state === 'cooldown' ? 0.45 : 0.9 }}>♥</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}
