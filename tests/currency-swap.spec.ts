import { test, expect } from '@mobilewright/test';
import {
  amountInput,
  expectConversion,
  expectCurrencyPair,
  fillAndExpectConversion,
  getExchangeRate,
  swapButton,
} from './helpers.js';

test.describe('Section 4.2: currency swap', () => {
  test.beforeEach(async ({ screen }) => {
    await expect(amountInput(screen)).toBeVisible();
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
  });

  test('VI-020 swaps an empty pair without reusing the old expression', async ({ screen }) => {
    await swapButton(screen).tap();
    await expectCurrencyPair(screen, 'CAD', 'USD');
    await expect(amountInput(screen)).toHaveValue('');
    await expect(screen.getByText(' USD =')).toBeHidden();
  });

  test('VI-021 recalculates the entered amount for the inverse pair', async ({ device, screen }) => {
    await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await swapButton(screen).tap();
    await expectCurrencyPair(screen, 'CAD', 'USD');
    await expect(amountInput(screen)).toHaveValue('10');
    const rate = await getExchangeRate(device, 'CAD', 'USD');
    await expectConversion(screen, '10', 10, 'CAD', 'USD', [rate]);
  });

  test('VI-022 preserves the original conversion after two swaps', async ({ device, screen }) => {
    const initialResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await swapButton(screen).tap();
    await expectCurrencyPair(screen, 'CAD', 'USD');
    await swapButton(screen).tap();
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('10');
    await expect(screen.getByText('10 USD =')).toBeVisible();
    await expect(screen.getByText(initialResult)).toBeVisible();
  });
});
