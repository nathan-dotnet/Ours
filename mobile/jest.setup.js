// Expo CLI normally inlines EXPO_PUBLIC_* vars from .env at build time; Jest doesn't go through
// that pipeline, so src/utils/env.ts would otherwise throw on import in every test.
process.env.EXPO_PUBLIC_API_URL ??= 'http://localhost:5100';
