import { useState } from 'react';
import { Share, Switch, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useAuthActions } from '@/hooks/useAuthActions';
import { useBiometricCapability, useBiometricLoginEnabled } from '@/hooks/useBiometricAuth';
import { useLocalCouple } from '@/hooks/useCouple';
import { disableBiometricLogin, enableBiometricLogin, biometricLabel } from '@/services/biometricAuth';
import { useAuthStore } from '@/stores/authStore';
import { triggerSync } from '@/sync';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const { logout } = useAuthActions();
  const capability = useBiometricCapability();
  const [biometricEnabled, refreshBiometricEnabled] = useBiometricLoginEnabled();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  const onLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const onSyncNow = async () => {
    setIsSyncing(true);
    try {
      await triggerSync();
    } finally {
      setIsSyncing(false);
    }
  };

  const onShareCode = async () => {
    if (!data?.couple) return;
    await Share.share({ message: `Join me on Ours! Use invite code ${data.couple.invite_code}.` });
  };

  const onToggleBiometric = async (value: boolean) => {
    setIsTogglingBiometric(true);
    try {
      if (value) {
        // Turning it on requires proving it actually works right now, not just flipping a flag.
        await enableBiometricLogin();
      } else {
        await disableBiometricLogin();
      }
    } finally {
      await refreshBiometricEnabled();
      setIsTogglingBiometric(false);
    }
  };

  return (
    <Screen scroll>
      <View className="gap-1 pb-6 pt-4">
        <Text className="text-3xl font-semibold text-ink">Settings</Text>
      </View>

      <View className="gap-6">
        <View className="gap-2 rounded-2xl bg-blush p-5">
          <Text className="text-lg font-semibold text-ink">Account</Text>
          <Text className="text-clay">{user?.displayName}</Text>
          <Text className="text-clay">{user?.email}</Text>
        </View>

        {data?.couple ? (
          <View className="gap-3 rounded-2xl bg-blush p-5">
            <Text className="text-lg font-semibold text-ink">Invite code</Text>
            <Text className="text-2xl font-bold tracking-widest text-rose">{data.couple.invite_code}</Text>
            <Button label="Share invite code" variant="secondary" onPress={onShareCode} />
          </View>
        ) : null}

        {capability?.available ? (
          <View className="gap-2 rounded-2xl bg-blush p-5">
            <Text className="text-lg font-semibold text-ink">Security</Text>
            <View className="flex-row items-center justify-between pt-1">
              <View className="flex-1 pr-3">
                <Text className="font-medium text-ink">Biometric Login</Text>
                <Text className="text-sm text-clay">Use {biometricLabel(capability.type)} to log in</Text>
              </View>
              <Switch
                value={biometricEnabled ?? false}
                onValueChange={onToggleBiometric}
                disabled={isTogglingBiometric || biometricEnabled === null}
              />
            </View>
          </View>
        ) : null}

        <View className="gap-3 rounded-2xl bg-blush p-5">
          <Text className="text-lg font-semibold text-ink">Sync</Text>
          <SyncStatusBadge />
          <Button label="Sync now" variant="secondary" onPress={onSyncNow} loading={isSyncing} />
        </View>

        <Button label="Log out" variant="secondary" onPress={onLogout} loading={isLoggingOut} />
      </View>
    </Screen>
  );
}
