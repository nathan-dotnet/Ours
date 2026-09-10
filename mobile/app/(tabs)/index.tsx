import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { MissMeButton, type MissMeButtonState } from '@/components/MissMeButton';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useLocalCouple } from '@/hooks/useCouple';
import { useMissMeStatus, useSendMissMe } from '@/hooks/useMissMe';
import { useAuthStore } from '@/stores/authStore';
import { triggerSync } from '@/sync';
import { softRaised } from '@/styles/neumorphism';
import { getGreeting } from '@/utils/greeting';
import { describeMissMeMoment, formatMomentTimestamp } from '@/utils/missMeActivity';
import { daysTogether } from '@/utils/relationship';

/** How long the button's brief "sent" confirmation stays up before falling back to the cooldown state — a small visual confirmation, not a lingering banner. */
const SENT_CONFIRMATION_MS = 2200;
/** "Little Moments" stays a handful of recent entries, never a scrolling feed. */
const HISTORY_PREVIEW_COUNT = 3;

function formatCooldownRemaining(nextAvailableAt: string, now: Date): string {
  const minutes = Math.ceil((new Date(nextAvailableAt).getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return 'a moment';
  return `${minutes} min`;
}

/**
 * The private, quiet home base — a greeting, the couple's own milestone number, one small
 * gesture (Miss Me), and two doors into the rest of the app. Editing the couple's nickname and
 * anniversary date now lives in Settings ("Our relationship") rather than here — this screen has
 * nothing to manage, only something to feel.
 */
export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const { data } = useLocalCouple();
  const couple = data?.couple ?? null;
  const partner = data?.members.find((m) => m.user_id !== user?.id);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [justSent, setJustSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const missMeStatus = useMissMeStatus(couple?.id);
  const sendMissMe = useSendMissMe();

  // Keeps the greeting and any cooldown countdown honest across midnight/half-hour boundaries
  // without polling the server — this only ever touches local component state.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerSync();
      await missMeStatus.refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const onPressMissMe = async () => {
    if (isSending) return;
    setActionError(null);
    setIsSending(true);
    try {
      const result = await sendMissMe('MissMe');
      if (result.sent) {
        setJustSent(true);
        setTimeout(() => setJustSent(false), SENT_CONFIRMATION_MS);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send this right now.');
    } finally {
      setIsSending(false);
    }
  };

  const onMissYouToo = async () => {
    const pending = missMeStatus.data?.pendingFromPartner;
    if (!pending || isReplying) return;
    setActionError(null);
    setIsReplying(true);
    try {
      await sendMissMe('MissYouToo', pending.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send this right now.');
    } finally {
      setIsReplying(false);
    }
  };

  const canSend = missMeStatus.data?.canSend ?? true;
  const buttonState: MissMeButtonState = isSending ? 'sending' : justSent ? 'sent' : !canSend ? 'cooldown' : 'idle';

  const buttonLabel = justSent
    ? 'sent 💌'
    : !canSend && missMeStatus.data?.nextAvailableAt
      ? `sent · back in ${formatCooldownRemaining(missMeStatus.data.nextAvailableAt, now)}`
      : 'miss you';

  const pending = missMeStatus.data?.pendingFromPartner;
  const history = missMeStatus.data?.recentHistory.slice(0, HISTORY_PREVIEW_COUNT) ?? [];

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#5B7FBE" />}>
      <View className="gap-1 pb-2 pt-4">
        <Text className="text-2xl font-medium text-clay">{getGreeting(now.getHours())},</Text>
        <Text className="text-3xl font-semibold text-ink">
          {user?.displayName ?? 'there'} <Text className="text-2xl opacity-60">❤</Text>
        </Text>
      </View>

      <SyncStatusBadge />

      <View className="items-center gap-1 py-8">
        {couple ? (
          (() => {
            const days = daysTogether(couple.anniversary_date, now);
            return days !== null ? (
              <>
                <Text className="text-5xl font-semibold text-ink">{days.toLocaleString()}</Text>
                <Text className="text-sm font-medium tracking-wide text-clay">days together</Text>
              </>
            ) : (
              <>
                <Text className="text-sm text-clay">Add your anniversary date in Settings</Text>
                <Text className="text-xs text-clay/70">to see how long you've been together</Text>
              </>
            );
          })()
        ) : (
          <Text className="text-sm text-clay">Your couple isn't set up on this device yet — pull to sync once you're online.</Text>
        )}
      </View>

      {couple && partner ? (
        <View className="items-center gap-3 pb-8">
          <MissMeButton state={buttonState} onPress={onPressMissMe} />
          <Text className="text-sm font-medium text-clay">{buttonLabel}</Text>
          {actionError ? <Text className="text-xs text-rose">{actionError}</Text> : null}
        </View>
      ) : couple ? (
        <View className="items-center pb-8">
          <Text className="text-sm text-clay">Waiting for your partner to join</Text>
        </View>
      ) : null}

      {pending ? (
        <View className="mb-8 gap-3 rounded-2xl bg-blush p-4" style={softRaised}>
          <Text className="text-base text-ink">💕 {pending.senderDisplayName} misses you</Text>
          <Button label="❤️ Miss You Too" variant="secondary" onPress={onMissYouToo} loading={isReplying} />
        </View>
      ) : null}

      {/*
        One card, thin row dividers — not one floating shadowed card per entry. Three short
        facts don't need three separate cards; that just burns vertical space for no extra
        information, and it was inconsistent with the Budget stat strip's own single-card-with-
        dividers treatment on Money. Title + timestamp share a single line (truncating rather
        than wrapping) since both are short and this is meant to be scanned quickly, not read.
      */}
      {history.length > 0 && user ? (
        <View className="gap-2 pb-8">
          <Text className="text-xs font-semibold uppercase tracking-wider text-clay">Little Moments</Text>
          <View className="rounded-2xl bg-blush px-1" style={softRaised}>
            {history.map((item, index) => (
              <View
                key={item.id}
                className={`flex-row items-center justify-between px-3 py-2.5 ${index < history.length - 1 ? 'border-b border-ink/10' : ''}`}
              >
                <Text className="flex-1 pr-3 text-sm text-ink" numberOfLines={1}>
                  {describeMissMeMoment(item, user.id, partner?.display_name ?? 'your partner')}
                </Text>
                <Text className="text-xs text-clay">{formatMomentTimestamp(item.createdAt, now)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-3 pb-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-clay">Our Moments</Text>
        <View className="flex-row gap-3">
          <MomentCard label="Dates" emoji="📅" onPress={() => router.push('/calendar')} />
          <MomentCard label="Vault" emoji="🔐" onPress={() => router.push('/vault')} />
        </View>
      </View>
    </Screen>
  );
}

/** A soft, tactile tile — one of a pair today, but sized/styled to sit alongside more later (Memories, Notes) without changing shape. */
function MomentCard({ label, emoji, onPress }: { label: string; emoji: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="h-28 flex-1 items-center justify-center gap-2 rounded-2xl bg-blush" style={softRaised}>
      <Text className="text-3xl">{emoji}</Text>
      <Text className="text-base font-medium text-ink">{label}</Text>
    </Pressable>
  );
}
