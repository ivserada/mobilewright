import { test, expect } from '@mobilewright/test';
import {
  amountInput,
  expectCurrencyPair,
  expectInsideViewport,
  expectMainScreen,
  expectNoApplicationError,
  fillAndExpectConversion,
  openCurrencyPicker,
  searchInput,
  selectNonDefaultPair,
  setNetworkEnabled,
  swapButton,
} from './helpers.js';

const APP_ID = 'com.vi';

test.describe('Section 5.3: application state, UI, and accessibility', () => {
  test.beforeEach(async ({ screen }) => {
    await expectMainScreen(screen);
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
  });

  test.afterEach(async ({ device }) => {
    await setNetworkEnabled(device, true);
    await device.setOrientation('portrait');
  });

  test('VI-050 preserves conversion state through Home and Recent Apps', async ({ device, screen }) => {
    await selectNonDefaultPair(screen);
    const result = await fillAndExpectConversion(device, screen, '10', 'EUR', 'CAD');
    await screen.pressButton('HOME');
    await expect.poll(async () => (await device.getForegroundApp())?.bundleId !== APP_ID).toBe(true);
    // Wait for the Home transition before invoking Recent Apps.
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await screen.pressButton('APP_SWITCH');
    const recentApp = screen.getByLabel('Vi', { exact: true }).last();
    await expect(recentApp).toBeVisible();
    await recentApp.tap();
    await expectMainScreen(screen);
    await expectCurrencyPair(screen, 'EUR', 'CAD');
    await expect(amountInput(screen)).toHaveValue('10');
    await expect(screen.getByText(result)).toBeVisible();
    await expectNoApplicationError(screen);
  });

  test('VI-051 resets UI state after force-stop but retains cached rates', async ({ device, screen }) => {
    const cachedResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await selectNonDefaultPair(screen);
    await fillAndExpectConversion(device, screen, '10', 'EUR', 'CAD');
    await device.terminateApp(APP_ID);
    await device.launchApp(APP_ID);
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
    await setNetworkEnabled(device, false);
    await amountInput(screen).fill('10');
    await expect(screen.getByText(cachedResult)).toBeVisible();
    await expectNoApplicationError(screen);
  });

  test('VI-052 preserves state and layout through both rotations', async ({ device, screen }) => {
    const result = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await device.setOrientation('landscape');
    await expect.poll(() => device.getOrientation()).toBe('landscape');
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('10');
    await expect(screen.getByText(result)).toBeVisible();
    await expectInsideViewport(device, amountInput(screen));
    await expectInsideViewport(device, screen.getByText(result));
    await expectInsideViewport(device, swapButton(screen));
    await device.setOrientation('portrait');
    await expect.poll(() => device.getOrientation()).toBe('portrait');
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('10');
    await expect(screen.getByText(result)).toBeVisible();
  });

  test('VI-053 supports amount and search input with keyboard dismissal', async ({ device, screen }) => {
    await amountInput(screen).tap();
    const result = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await expect(amountInput(screen)).toBeFocused();
    await expect.poll(() => screen.keyboard.isVisible()).toBe(true);
    await screen.keyboard.hide();
    await expect.poll(() => screen.keyboard.isVisible()).toBe(false);
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(screen.getByText(result)).toBeVisible();
    await openCurrencyPicker(screen, 'USD');
    await searchInput(screen).fill('usd');
    await expect(searchInput(screen)).toBeFocused();
    await expect.poll(() => screen.keyboard.isVisible()).toBe(true);
    await screen.keyboard.hide();
    await expect.poll(() => screen.keyboard.isVisible()).toBe(false);
    await expect(screen.getByText('USD - US Dollar')).toBeVisible();
    await screen.getByText('USD - US Dollar').tap();
    await expectCurrencyPair(screen, 'USD', 'CAD');
  });

  test('VI-054 exposes accessible swap and selected-currency semantics', async ({ screen }) => {
    // Tree assertions run without TalkBack; spoken speech still requires separate manual verification.
    await expect.soft(screen.getByRole('button', { name: /swap currencies/i })).toBeVisible({ timeout: 2_000 });
    await openCurrencyPicker(screen, 'USD');
    await expect.soft(screen.getByText('USD - US Dollar')).toBeSelected({ timeout: 2_000 });
  });
});
