// EXPO_PUBLIC_* values are embedded when Expo creates the JavaScript bundle. Keep the value
// available even when a stale/misconfigured build omitted it so the API client can show a
// recoverable, actionable error on the login screen instead of crashing during module import.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';

export const env = {
  apiUrl,
};
