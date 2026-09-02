import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';

export default function OnboardingChoiceScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-8">
        <View className="items-center gap-2">
          <Text className="text-3xl font-semibold text-ink">One more step</Text>
          <Text className="text-center text-base text-clay">
            Ours is for exactly two people. Start a couple, or join the one your partner already started.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Button label="Start our couple" onPress={() => router.push('/(onboarding)/create-couple')} />
          <Button label="I have an invite code" variant="secondary" onPress={() => router.push('/(onboarding)/join-couple')} />
        </View>
      </View>
    </Screen>
  );
}
