import { defineConfig } from 'mobilewright';

const apkPath = process.env.ANDROID_APK_PATH ?? './app/curr_converter.apk';
const deviceId = process.env.ANDROID_DEVICE_ID;

export default defineConfig({
  platform: 'android',
  bundleId: process.env.ANDROID_APP_ID ?? 'com.vi',
  ...(deviceId
    ? { deviceId }
    : { deviceName: new RegExp(process.env.ANDROID_DEVICE_NAME ?? 'Medium Phone API 37\\.0') }),
  ...(apkPath ? { installApps: apkPath } : {}),
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  viewTree: 'on-failure',
});
