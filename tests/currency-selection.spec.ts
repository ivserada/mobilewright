import { test, expect } from '@mobilewright/test';
import {
  amountInput,
  expectCurrencyPair,
  expectNoApplicationError,
  fillAndExpectConversion,
  openCurrencyPicker,
  searchInput,
  selectCurrency,
} from './helpers.js';

test.describe('Section 4.1: currency selection and search', () => {
  test.beforeEach(async ({ screen }) => {
    await expect(amountInput(screen)).toBeVisible();
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
  });

  test('VI-010 opens the source selector with currencies and a selected value', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    await expect(searchInput(screen)).toHaveValue('');
    await expect(screen.getByText('USD - US Dollar')).toBeVisible();
    await expect(screen.getByText('CAD - Canadian Dollar')).toBeVisible();
    await expect(screen.getByText('EUR - Euro')).toBeVisible();

    // The APK exposes the visual radio state through its icon, not an accessibility property.
    await expect(screen.getByText('\uE984', { exact: true })).toHaveCount(1);
  });

  test('VI-011 changes the target currency and clears the old amount and result', async ({ device, screen }) => {
    const previousResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await selectCurrency(screen, 'CAD', 'EUR - Euro');
    await expectCurrencyPair(screen, 'USD', 'EUR');
    await expect(amountInput(screen)).toHaveValue('');
    await expect(screen.getByText('10 USD =')).toBeHidden();
    await expect(screen.getByText(previousResult)).toBeHidden();
    await expectNoApplicationError(screen);
  });

  test('VI-012 changes the source currency and recalculates a new amount', async ({ device, screen }) => {
    await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await selectCurrency(screen, 'USD', 'EUR - Euro');
    await expectCurrencyPair(screen, 'EUR', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
    await fillAndExpectConversion(device, screen, '10', 'EUR', 'CAD');
  });

  test('VI-013 filters currencies by a case-insensitive code', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    await searchInput(screen).fill('usd');
    await expect(searchInput(screen)).toHaveValue('usd');
    await expect(screen.getByText('USD - US Dollar')).toBeVisible();
    await expect(screen.getByText('CAD - Canadian Dollar')).toBeHidden();
    await expect(screen.getByText('EUR - Euro')).toBeHidden();
  });

  test('VI-014 filters by currency name and selects a result', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    await searchInput(screen).fill('euro');
    await expect(screen.getByText('EUR - Euro')).toBeVisible();
    await screen.getByText('EUR - Euro').tap();
    await expectCurrencyPair(screen, 'EUR', 'CAD');
    await expect(amountInput(screen)).toBeVisible();
  });

  test('VI-015 keeps a query with no matches without crashing', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    await searchInput(screen).fill('zzzz');
    await expect(searchInput(screen)).toHaveValue('zzzz');
    await expect(screen.getByText('USD - US Dollar')).toBeHidden();
    await expect(screen.getByText('CAD - Canadian Dollar')).toBeHidden();
    await expect(screen.getByText('EUR - Euro')).toBeHidden();
    await expectNoApplicationError(screen);
  });

  test('VI-016 clears the query and restores the full list and selection', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    await searchInput(screen).fill('usd');
    await searchInput(screen).clear();
    await expect(searchInput(screen)).toHaveValue('');
    await expect(screen.getByText('USD - US Dollar')).toBeVisible();
    await expect(screen.getByText('CAD - Canadian Dollar')).toBeVisible();
    await expect(screen.getByText('EUR - Euro')).toBeVisible();
    await expect(screen.getByText('\uE984', { exact: true })).toHaveCount(1);
  });

  test('VI-017 scrolls to and selects a currency outside the first screen', async ({ screen }) => {
    await openCurrencyPicker(screen, 'USD');
    const yen = screen.getByText('JPY - Japanese Yen');
    await yen.scrollIntoViewIfNeeded({ maxSwipes: 15 });
    await expect(yen).toBeVisible();
    await yen.tap();
    await expectCurrencyPair(screen, 'JPY', 'CAD');
    await expect(amountInput(screen)).toHaveValue('');
  });

  test('VI-018 preserves the amount and result after Back from the selector', async ({ device, screen }) => {
    const previousResult = await fillAndExpectConversion(device, screen, '10', 'USD', 'CAD');
    await screen.keyboard.hide();
    await openCurrencyPicker(screen, 'USD');
    await screen.goBack();
    await expect(amountInput(screen)).toBeVisible();
    await expectCurrencyPair(screen, 'USD', 'CAD');
    await expect(amountInput(screen)).toHaveValue('10');
    await expect(screen.getByText(previousResult)).toBeVisible();
  });
});
