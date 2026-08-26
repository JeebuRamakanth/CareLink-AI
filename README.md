# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
=======
# CareLink-
CareLink AI is an AI-powered Hospital Management System designed to simplify hospital operations. It helps manage appointments, patient records, billing, pharmacy, and doctor schedules efficiently, making healthcare services faster, smarter, and more reliable.

## Android app (Capacitor)

The Android app is a Capacitor 8 shell around this web application — the web
app remains the single source of truth. See **[PLAY_STORE_RELEASE.md](./PLAY_STORE_RELEASE.md)**
for full build/signing/publishing instructions.

```bash
npm ci                      # install dependencies
npm run android:sync        # web build + sync into android/
npm run android:open        # open in Android Studio
npm run android:run         # run on a connected device/emulator
npm run android:apk         # debug APK  -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:aab         # release AAB -> android/app/build/outputs/bundle/release/app-release.aab
npm run android:assets      # regenerate launcher icons + splash from assets/*.svg
```

Requirements: Node 22, JDK 21, Android SDK (platform 36). Release signing is
configured via a git-ignored `android/keystore.properties` or `CARELINK_*`
environment variables — never commit keystores or passwords. A GitHub Actions
workflow (`.github/workflows/android-build.yml`) builds the APK and AAB on
every push.
