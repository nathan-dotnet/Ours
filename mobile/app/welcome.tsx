import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';

export default function WelcomeScreen() {
  const router = useRouter();
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

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-10">
        <Image
          source={require('../assets/Ours.png')}
          accessibilityLabel="Ours"
          style={{ width: 116, height: 116 }}
          resizeMode="contain"
        />

        <View className="items-center gap-2">
          <Text className="text-3xl font-semibold text-ink">
            Money, together.
          </Text>

          <Text className="max-w-xs text-center text-base text-clay">
            A shared space to plan, save, and grow your future — just the two of you.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Pressable
            onPress={() => {
              console.log('🔥 GET STARTED PRESSED');
              router.push('/register');
            }}
            style={{
              width: '100%',
              backgroundColor: '#2268E5',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              Get Started
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              console.log('🔥 LOGIN PRESSED');
              router.push('/login');
            }}
            style={{
              width: '100%',
              borderWidth: 1,
              borderColor: '#DDD',
              backgroundColor: '#FFFFFF',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#333333',
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              I already have an account
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
