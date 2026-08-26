import type { CapacitorConfig } from "@capacitor/cli";

// NOTE: appId is the permanent Play Store package identifier once published.
// It can be changed freely BEFORE the first Play Console upload — confirm the
// final value with the repository owner before submitting (see
// PLAY_STORE_RELEASE.md).
const config: CapacitorConfig = {
  appId: "com.carelinkai.app",
  appName: "CareLink AI",
  webDir: "dist",
  android: {
    // Mixed content is never needed: the app only talks to HTTPS backends.
    allowMixedContent: false,
  },
  server: {
    // Only HTTPS backends (Supabase, Cloudinary, AI gateway) are contacted.
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#050816",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#050816",
    },
  },
};

export default config;
