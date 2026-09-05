// Expo development build (NOT Expo Go) - research D4. Expo Go cannot host the
// custom native modules the media path may need for background upload (FR-008).
export default {
  name: 'socialInterest',
  slug: 'socialinterest',
  version: '0.0.0',
  orientation: 'portrait',
  scheme: 'socialinterest',
  ios: { supportsTablet: false, bundleIdentifier: 'app.socialinterest' },
  android: { package: 'app.socialinterest' },
  extra: {
    // Points at the local profile by default. A device cannot reach a cloud
    // sandbox (no inbound route) - run the API on your own machine.
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/v1',
  },
};
