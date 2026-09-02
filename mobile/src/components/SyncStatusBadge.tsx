import { Text, View } from 'react-native';
import { useSyncStore } from '../stores/syncStore';

/** Subtle status pill — Offline / Syncing… / All changes synced ✓ — never a blocking banner. */
export function SyncStatusBadge() {
  const status = useSyncStore((s) => s.status);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  const label = (() => {
    switch (status) {
      case 'offline':
        return pendingCount > 0 ? `Offline · ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued` : 'Offline';
      case 'syncing':
        return 'Syncing…';
      case 'error':
        return pendingCount > 0 ? `Sync paused · ${pendingCount} pending` : 'Sync paused';
      case 'synced':
      default:
        return 'All changes synced ✓';
    }
  })();

  return (
    <View className="self-start rounded-full bg-blush px-3 py-1">
      <Text className="text-xs font-medium text-clay">{label}</Text>
    </View>
  );
}
