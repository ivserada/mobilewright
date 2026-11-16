import { test, expect } from '@mobilewright/test';
import type { Device, Screen } from 'mobilewright';
import {
  amountInput,
  expectConversion,
  expectNoApplicationError,
  fillAndExpectConversion,
  getExchangeRate,
  readConversionResult,
  visibleTexts,
} from './helpers.js';

async function hasValidationError(screen: Screen): Promise<boolean> {
  return (await visibleTexts(screen)).some(text => /invalid|not a number|enter a valid|wrong format|incorrect amount/i.test(text));
}

async function expectAcceptedAmountOrValidationError(
  device: Device,
  screen: Screen,
  displayedAmount: string,
  numericAmount: number,
): Promise<void> {
  const previousResult = await readConversionResult(screen, 'CAD');
  await amountInput(screen).fill(displayedAmount);

  await expect.poll(async () => {
    if (await hasValidationError(screen)) {
      return true;
    }
    const result = await readConversionResult(screen, 'CAD');
    return result !== null && result !== previousResult;
  }, { timeout: 10_000 }).toBe(true);

  if (await hasValidationError(screen)) {
    if (previousResult !== null) {
      await expect(screen.getByText(previousResult)).toBeHidden();
    }
    expect(await readConversionResult(screen, 'CAD')).toBeNull();
  } else {
    const rate = await getExchangeRate(device, 'USD', 'CAD');
    await expectConversion(screen, displayedAmount, numericAmount, 'USD', 'CAD', [rate]);
  }
  await expectNoApplicationError(screen);
}

test.describe('Section 5.1: amount validation', () => {
  test.beforeEach(async ({ screen }) => {
    await expect(amountInput(screen)).toBeVisible();
    await expect(amountInput(screen)).toHaveValue('');
  });

  test('VI-030 removes the previous result after alphabetic input', async ({ device, screen }) => {
    const previousResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await amountInput(screen).fill('abc');

    await expect.poll(async () => {
      return await hasValidationError(screen) || await readConversionResult(screen, 'CAD') === null;
    }, { timeout: 10_000 }).toBe(true);
    await expect(screen.getByText(previousResult)).toBeHidden();
    await expectNoApplicationError(screen);
  });

  test('VI-031 either converts a comma decimal or rejects it without a stale result', async ({ device, screen }) => {
    await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await expectAcceptedAmountOrValidationError(device, screen, '10,5', 10.5);
  });

  test('VI-032 handles a negative amount without NaN or Infinity', async ({ device, screen }) => {
    // Q-001 is unresolved: either an accurate conversion or explicit validation is accepted.
    await expectAcceptedAmountOrValidationError(device, screen, '-10', -10);
  });

  test('VI-033 handles exponential notation without retaining a stale result', async ({ device, screen }) => {
    // The case permits either support for 1e3 or a clear format-validation response.
    await expectAcceptedAmountOrValidationError(device, screen, '1e3', 1000);
  });
});
