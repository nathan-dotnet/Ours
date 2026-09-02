import type { ReactElement, ReactNode } from 'react';
import { RefreshControlProps, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Pass a <RefreshControl> to enable pull-to-refresh (only meaningful with scroll). */
  refreshControl?: ReactElement<RefreshControlProps>;
}

/** Consistent page chrome — safe area, warm background, comfortable padding — for every screen. */
export function Screen({ children, scroll = false, refreshControl }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 32 }}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-6 py-4">{children}</View>
      )}
    </SafeAreaView>
  );
}
