import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

function isOnlineState(state: NetInfoState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

export async function getIsOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isOnlineState(state);
}

/** Subscribes to connectivity changes; returns an unsubscribe function. */
export function subscribeToConnectivity(onChange: (isOnline: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => onChange(isOnlineState(state)));
}
