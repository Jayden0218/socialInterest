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
  // T037. expo-image-picker's config plugin declares the platform permissions
  // and the string a person is shown when asked. The default string is generic;
  // this one says what the app wants the access FOR, which is what FR-012 is
  // about on the grant side just as the explanation is on the refusal side.
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission:
          'socialInterest needs access to your photos so you can choose what to post. ' +
          'Nothing is read or uploaded until you pick something.',
      },
    ],
  ],
  // The API base URL comes from EXPO_PUBLIC_API_BASE_URL, which Expo inlines at
  // build time and src/config.ts reads. It deliberately does NOT live in `extra`:
  // it was in both, under different names, and nothing read the `extra` copy.
  //
  // Set it at build time to whatever the device can reach - a LAN address, or a
  // tunnel URL when the device is not on your network.
};
