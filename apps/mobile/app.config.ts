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
      /**
       * THE TYPEFACE, EMBEDDED AT BUILD TIME (FR-022).
       *
       * `expo-font`'s plugin copies these into the native project, so the app
       * has them the instant it starts — no `useFonts`, no loading gate, and no
       * flash of Roboto before the real face arrives. A release build that has
       * to fetch or await its own brand font is a release build that renders
       * wrong for the first frame every cold start.
       *
       * THE FAMILY NAME ON ANDROID IS THE FILE NAME WITHOUT ITS EXTENSION, which
       * is why these are named for their weights and why `FONT` in `tokens.ts`
       * maps weight to exactly these four strings. Rename a file here and the
       * app silently falls back to Roboto — which is the defect this whole
       * change exists to fix, so the names are load-bearing.
       */
      'expo-font',
      {
        fonts: [
          './assets/fonts/PlusJakartaSans-Regular.ttf',
          './assets/fonts/PlusJakartaSans-Medium.ttf',
          './assets/fonts/PlusJakartaSans-SemiBold.ttf',
          './assets/fonts/PlusJakartaSans-Bold.ttf',
        ],
      },
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
  /**
   * EAS needs to know WHICH Expo project this is, and a dynamic config cannot be
   * rewritten by `eas init` the way a static app.json can — so the id comes from
   * the environment and is stored as a repository VARIABLE (not a secret: a
   * project id is an identifier, not a credential).
   *
   * `.github/workflows/apk.yml` prints the id on its first run and tells you
   * where to put it. Until then this is undefined and EAS says so plainly rather
   * than building the wrong project.
   */
  extra: {
    eas: {
      // Created by `eas init` on 2026-09-12 and committed deliberately. A project
      // id is an IDENTIFIER, not a credential — it appears in every build's URL
      // and in Expo's dashboard — so it belongs in the repository rather than in
      // a shell export that dies with the terminal it was typed into.
      //
      // The environment still wins, so a fork or a second Expo account can point
      // the same source at its own project without editing this file.
      projectId: process.env['EAS_PROJECT_ID'] ?? 'ec4c46a7-7c75-478b-8d34-b6cb4d8b30b9',
    },
  },

  // The API base URL comes from EXPO_PUBLIC_API_BASE_URL, which Expo inlines at
  // build time and src/config.ts reads. It deliberately does NOT live in `extra`:
  // it was in both, under different names, and nothing read the `extra` copy.
  //
  // SINCE 009/US1 THIS NO LONGER PINS THE BUILD TO ONE BACKEND. The address is
  // settable on the sign-in screen and persisted on the device, so what is
  // compiled in is only a starting default. One APK now works against every
  // session, which is what makes a cloud build worth doing once rather than
  // per session.
};
