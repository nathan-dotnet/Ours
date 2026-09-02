const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and point it at your backend ' +
      '(see the comments in that file for simulator/device-specific values).',
  );
}

export const env = {
  apiUrl,
};
