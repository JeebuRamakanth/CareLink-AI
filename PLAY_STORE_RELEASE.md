# CareLink AI — Android & Google Play Release Guide

This document explains how to build, sign, and publish the Android version of
CareLink AI. The Android app is a **Capacitor 8 shell around the existing
React/Vite web application** — the web app remains the single source of truth
for UI, routing, and business logic.

> ⚠️ **App ID decision required before first upload.** The application ID is
> currently `com.carelinkai.app` (placeholder reverse-domain). Once an app is
> uploaded to Play Console, its application ID can **never** be changed.
> Confirm the final value with the project owner **before** the first upload.
> To change it: update `appId` in `capacitor.config.ts`, `applicationId` and
> `namespace` in `android/app/build.gradle`, rename the Java package directory
> under `android/app/src/main/java/`, and update `package_name` /
> `custom_url_scheme` in `android/app/src/main/res/values/strings.xml`.

---

## 1. Prerequisites

| Tool | Version | Cost |
| --- | --- | --- |
| Node.js | 22 LTS | free |
| JDK | 21 (Temurin/OpenJDK) | free |
| Android SDK | platform 36, build-tools 36.0.0 | free |
| Android Studio (optional, for GUI runs) | latest | free |
| Google Play Developer account | — | **$25 one-time registration fee (paid to Google — not avoidable)** |

No paid SDKs, build services, or subscriptions are used anywhere in the
pipeline.

## 2. Environment setup

```bash
# Java 21 and Android SDK must be installed. Then either:
export ANDROID_HOME=/path/to/android-sdk
# or create android/local.properties (git-ignored) with:
# sdk.dir=/path/to/android-sdk
```

## 3. Build commands

```bash
npm ci                      # install dependencies

# Web (unchanged workflow)
npm run dev                 # web dev server
npm run build               # web production build -> dist/

# Android
npm run android:sync        # web build + copy into android/ + update plugins
npm run android:open        # open the project in Android Studio
npm run android:run         # build + deploy to a connected device/emulator
npm run android:apk         # debug APK
npm run android:aab         # release AAB (signed only if signing is configured)
npm run android:assets      # regenerate launcher icons + splash from assets/*.svg
```

## 4. Artifact locations

| Artifact | Path |
| --- | --- |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release AAB | `android/app/build/outputs/bundle/release/app-release.aab` |
| Release APK (optional) | `android/app/build/outputs/apk/release/app-release.apk` |

## 5. Signing (required for Play Store)

Google Play only accepts **signed** App Bundles. Signing material is **never**
committed to this repository (`*.keystore`, `*.jks`, `keystore.properties` are
git-ignored).

### 5.1 Create an upload key (one time, keep it safe)

```bash
keytool -genkeypair -v \
  -keystore upload-key.keystore \
  -alias carelink-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore and passwords in a password manager. If you lose the upload
key you must reset it through Play Console (only possible because Play App
Signing holds the real app-signing key — enrol in it, see §7).

### 5.2 Configure signing locally

Create `android/keystore.properties` (git-ignored):

```properties
storeFile=upload-key.keystore        # path relative to android/
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=carelink-upload
keyPassword=YOUR_KEY_PASSWORD
```

Or use environment variables instead:

```bash
export CARELINK_KEYSTORE_FILE=/secure/path/upload-key.keystore
export CARELINK_KEYSTORE_PASSWORD=...
export CARELINK_KEY_ALIAS=carelink-upload
export CARELINK_KEY_PASSWORD=...
```

`android/app/build.gradle` activates the `release` signing config only when
all four values are present; otherwise the release build is **unsigned** and a
warning is printed. An unsigned AAB cannot be uploaded to Play Console.

### 5.3 CI signing (GitHub Actions)

`.github/workflows/android-build.yml` signs the AAB when these repository
secrets exist (Settings → Secrets and variables → Actions):

- `ANDROID_KEYSTORE_BASE64` — `base64 -w0 upload-key.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## 6. Versioning

Edit `android/app/build.gradle` → `defaultConfig`:

- `versionCode` — integer, **must increase with every upload** (currently `1`).
- `versionName` — human-readable, e.g. `"1.0.0"`.

Then `npm run android:aab` and upload the new bundle.

## 7. Play Console setup (owner actions)

1. Create a Google Play Developer account ($25 one-time fee).
2. Create the app; choose a default language; declare it as an app (not game).
3. Enrol in **Play App Signing** (recommended; Google holds the app-signing
   key, your upload key stays replaceable).
4. Upload `app-release.aab` to an internal/closed testing track first.
5. Complete the store listing: app name, short/full description, category
   (Medical/Health), screenshots (phone + 7"/10" tablet), feature graphic
   (1024×500), icon (512×512 — use `assets/icon-only.png`).
6. **Privacy policy URL is mandatory** for an app handling health data. Host
   the policy and link it in the store listing. Do not publish without one.
7. Complete the **Data safety** form honestly (see §8).
8. Complete the **Health apps declaration** (Play requires it for health apps).
9. Content rating questionnaire, target audience, news/app access declarations.

## 8. Permissions & data safety

The manifest requests only what existing features use:

| Permission | Why | Data safety note |
| --- | --- | --- |
| `INTERNET` | HTTPS calls to Supabase / Cloudinary / AI gateway | — |
| `CAMERA` | Scanning prescriptions/lab reports via `<input capture>` | Photos are user-initiated uploads |
| `ACCESS_COARSE/FINE_LOCATION` | "Find Care Near Me" geolocation | Approximate/precise location, used on request |

Camera and location are declared `android:required="false"` so devices without
them can still install. There are **no** background-location, contacts,
microphone, or notification permissions.

Data safety topics to review with the owner: health documents uploaded by the
user (stored in Supabase private bucket / Cloudinary when configured, otherwise
locally on-device), authentication identifiers, approximate location. The web
app's mock/demo mode stores data only in on-device WebView storage.

## 9. Security checklist (already enforced in the project)

- No secrets in the frontend: only `VITE_*` browser-safe values; the AI
  provider key lives only in the Supabase edge function.
- `android:allowBackup="false"` — medical data in WebView storage is excluded
  from cloud backups.
- Cleartext HTTP is disabled (default for targetSdk 28+); `allowMixedContent`
  is false in `capacitor.config.ts`.
- No deep links / custom URL schemes are exposed; the only intent-filter is
  the launcher.
- No `service_role` keys, keystores, or passwords in version control.

## 10. Testing before release

1. `npm run build && npm run lint` — web baseline stays green.
2. `npm run android:apk` — install on a real device:
   `adb install android/app/build/outputs/apk/debug/app-debug.apk`
3. Verify: app launches, splash shows, navigation (incl. hardware back button),
   login/register (mock or Supabase), hospital/doctor browsing, appointments,
   documents upload (camera + files), "Find Care Near Me" (grant location),
   emergency `tel:` links, external links open in the system browser.
4. Verify offline behaviour: with no network the app still loads (assets are
   bundled) and repositories fall back to local/mock data — it never claims to
   be an offline app; API-backed features degrade gracefully.
5. Internal testing track on Play Console before production.

## 11. Release checklist

- [ ] Final `appId` confirmed by owner (irreversible after first upload)
- [ ] `versionCode` bumped, `versionName` updated
- [ ] Upload key created and backed up; `keystore.properties` or CI secrets set
- [ ] `npm run android:aab` produces a **signed** `app-release.aab`
- [ ] Play App Signing enrolled
- [ ] Privacy policy URL live
- [ ] Data safety + health apps declarations completed
- [ ] Store listing, screenshots, feature graphic uploaded
- [ ] Internal/closed track tested on real devices
- [ ] No secrets in git history (`git log -p | grep -i keystore` returns nothing)
