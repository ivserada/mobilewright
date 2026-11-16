import { test, expect } from '@mobilewright/test';
import {
  amountInput,
  expectNoApplicationError,
  fillAndExpectConversion,
  readConversionResult,
  restartApp,
  setNetworkEnabled,
} from './helpers.js';

const APP_ID = 'com.vi';

test.describe('Section 5.2: network and cached exchange rates', () => {
  test.afterEach(async ({ device }) => {
    await setNetworkEnabled(device, true);
  });

  test('VI-040 converts offline using a cached rate after restart', async ({ device, screen }) => {
    const cachedResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await setNetworkEnabled(device, false);
    await restartApp(device, screen, APP_ID);
    await amountInput(screen).fill('10');
    await expect(screen.getByText('10 USD =')).toBeVisible();
    await expect(screen.getByText(cachedResult)).toBeVisible();
    await expectNoApplicationError(screen);
  });

  test('VI-041 shows a dismissible error offline without a cached rate', async ({ device, screen }) => {
    await device.clearAppData(APP_ID);
    await setNetworkEnabled(device, false);
    await device.launchApp(APP_ID);
    const error = screen.getByText('Error: Exchange rate not found.');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(screen.getByText('OK', { exact: true })).toBeVisible();
    expect(await readConversionResult(screen, 'CAD')).toBeNull();
    await screen.getByText('OK', { exact: true }).tap();
    await expect(error).toBeHidden();
    await expect(amountInput(screen)).toBeVisible();
  });

  test('VI-042 retries conversion after connectivity returns', async ({ device, screen }) => {
    await device.clearAppData(APP_ID);
    await setNetworkEnabled(device, false);
    await device.launchApp(APP_ID);
    const error = screen.getByText('Error: Exchange rate not found.');
    await expect(error).toBeVisible({ timeout: 15_000 });
    await screen.getByText('OK', { exact: true }).tap();
    await expect(error).toBeHidden();
    await setNetworkEnabled(device, true);
    await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await expectNoApplicationError(screen);
  });
});
