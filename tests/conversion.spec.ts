import { test, expect } from '@mobilewright/test';
import {
  amountInput,
  boxesOverlap,
  expectCurrencyPair,
  expectInsideViewport,
  expectMainScreen,
  expectNoApplicationError,
  fillAndExpectConversion,
  readConversionResult,
  selectCurrency,
} from './helpers.js';

test.describe('Section 3: launch and base conversion', () => {
  test.beforeEach(async ({ screen }) => {
    await expectMainScreen(screen);
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
  });

  test('VI-001 launches with the default state', async ({ device, screen, bundleId }) => {
    expect(bundleId).toBe('com.vi');
    expect((await device.getForegroundApp())?.bundleId).toBe('com.vi');
    await expectMainScreen(screen);
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
    await expectNoApplicationError(screen);
  });

  test('VI-002 converts a positive integer using the current rate', async ({ device, screen }) => {
    await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await expectNoApplicationError(screen);
  });

  test('VI-003 supports identical source and target currencies', async ({ device, screen }) => {
    await selectCurrency(screen, 'CAD', 'USD - US Dollar');
    await expectCurrencyPair(screen, 'USD', 'USD');
    const result = await fillAndExpectConversion(device, screen, '10', 'USD', 'USD');
    expect(result).toBe('10.00 USD');
    await expectNoApplicationError(screen);
  });

  test('VI-004 converts zero without an error', async ({ device, screen }) => {
    await fillAndExpectConversion(device, screen, '0', 'USD', 'CAD');
    await expect(screen.getByText('0.00 CAD')).toBeVisible();
    await expectNoApplicationError(screen);
  });

  test('VI-005 clears the expression when the amount is erased', async ({ device, screen }) => {
    const previousResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await amountInput(screen).clear();
    await expect(amountInput(screen)).toHaveValue('');
    await expect(screen.getByText(' USD =')).toBeVisible();
    await expect(screen.getByText('10 USD =')).toBeHidden();
    await expect(screen.getByText(previousResult)).toBeHidden();

    // Q-002 remains unresolved; the case documents 0.00 CAD as the current non-blocking behavior.
    await expect(screen.getByText('0.00 CAD')).toBeVisible();
  });

  test('VI-006 recalculates every valid amount change', async ({ device, screen }) => {
    const firstResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    const secondResult = await fillAndExpectConversion(device, screen, '20', 'USD', 'CAD');
    expect(secondResult).not.toBe(firstResult);
    await expectNoApplicationError(screen);
  });

  test('VI-007 formats fractional results to two decimals', async ({ device, screen }) => {
    const result = await fillAndExpectConversion(device, screen, '10.55', 'USD', 'CAD');
    expect(result).toMatch(/^-?\d+\.\d{2} CAD$/);
    expect(await readConversionResult(screen, 'CAD')).toBe(result);
  });

  test('VI-008 keeps a very large finite result inside the viewport', async ({ device, screen }) => {
    const result = await fillAndExpectConversion(device, screen, '999999999999', 'USD', 'CAD');
    expect(Number.isFinite(Number.parseFloat(result))).toBe(true);
    await expectNoApplicationError(screen);
    await screen.keyboard.hide();
    const resultBox = await expectInsideViewport(device, screen.getByText(result));
    const amountBox = await expectInsideViewport(device, amountInput(screen));
    expect(boxesOverlap(resultBox, amountBox)).toBe(false);
  });
});
