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
      // The device pass points the app at http://10.0.2.2:3000 - the emulator's
      // alias for the host loopback, where the API runs on the same runner.
      // Since Android 9 cleartext HTTP is blocked by default, and the generated
      // release manifest carried neither this attribute nor a network security
      // config, so every request the app made would have been refused by the
      // platform before reaching the network.
      //
      // NOT `android.usesCleartextTraffic` in this config: that field is
      // accepted silently and does nothing here. Checked against the generated
      // manifest rather than assumed.
      //
      // This serves the emulator journeys, which have no TLS to offer. A hosted
      // deployment must serve HTTPS, and this should go when it does.
      'expo-build-properties',
      { android: { usesCleartextTraffic: true } },
    ],
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
