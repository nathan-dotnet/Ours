import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useCoupleActions } from '@/hooks/useCoupleActions';
import { ApiError } from '@/services/api';
import type { CoupleActionResponseDto } from '@/types/api';
import { softRaised } from '@/styles/neumorphism';

export default function CreateCoupleScreen() {
  const { createCouple, finalizeCoupleAction } = useCoupleActions();
  const [result, setResult] = useState<CoupleActionResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const onCreate = async () => {
    setError(null);
    setIsCreating(true);
    try {
      setResult(await createCouple());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your couple. Check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const onShare = async () => {
    if (!result) return;
    await Share.share({ message: `Join me on Ours! Use invite code ${result.couple.inviteCode}.` });
  };

  const onContinue = async () => {
    if (!result) return;
    setIsContinuing(true);
    // Navigation to Home happens automatically once this resolves — see app/_layout.tsx.
    await finalizeCoupleAction(result);
  };

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-8">
        {result ? (
          <View className="items-center gap-4">
            <Text className="text-2xl font-semibold text-ink">Share this with your partner</Text>
            <View className="rounded-2xl bg-blush px-8 py-6" style={softRaised}>
              <Text className="text-center text-3xl font-bold tracking-widest text-rose">{result.couple.inviteCode}</Text>
            </View>
            <Text className="text-center text-clay">
              They'll enter this code from "I have an invite code" to join. You can find it again later from Settings.
            </Text>
            <Button label="Share invite code" variant="secondary" onPress={onShare} />
            <Button label="Continue to Ours" onPress={onContinue} loading={isContinuing} />
          </View>
        ) : (
          <View className="items-center gap-4">
            <Text className="text-2xl font-semibold text-ink">Start your couple</Text>
            <Text className="text-center text-clay">We'll generate a private invite code for your partner to join.</Text>
            {error ? <Text className="text-center text-sm text-rose">{error}</Text> : null}
            <Button label="Generate invite code" onPress={onCreate} loading={isCreating} />
          </View>
        )}
      </View>
    </Screen>
  );
}
