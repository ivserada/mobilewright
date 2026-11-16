import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { expect } from '@mobilewright/test';
import type { Device, Locator, Screen } from 'mobilewright';
import type { Bounds, ViewNode } from '@mobilewright/protocol';

const execFileAsync = promisify(execFile);
const DEFAULT_EXPECT_TIMEOUT = 10_000;

export function amountInput(screen: Screen): Locator {
  return screen.getByPlaceholder('Amount');
}

export function searchInput(screen: Screen): Locator {
  return screen.getByPlaceholder('Search by currency code or name');
}

export function swapButton(screen: Screen): Locator {
  // The current APK exposes only this glyph; VI-054 verifies the missing accessible name.
  return screen.getByText('\uF0EC', { exact: true });
}

export async function restartApp(device: Device, screen: Screen, bundleId: string): Promise<void> {
  await device.terminateApp(bundleId);
  await device.launchApp(bundleId);
  await expect(amountInput(screen)).toBeVisible();
}

export async function expectMainScreen(screen: Screen): Promise<void> {
  await expect(screen.getByText('From:', { exact: false })).toBeVisible();
  await expect(screen.getByText('To:', { exact: false })).toBeVisible();
  await expect(screen.getByText('Amount:', { exact: false })).toBeVisible();
  await expect(amountInput(screen)).toBeVisible();
  await expect(swapButton(screen)).toBeVisible();
}

export async function expectCurrencyPair(screen: Screen, from: string, to: string): Promise<void> {
  if (from === to) {
    await expect(screen.getByText(from, { exact: true })).toHaveCount(2);
    return;
  }
  await expect(screen.getByText(from, { exact: true })).toBeVisible();
  await expect(screen.getByText(to, { exact: true })).toBeVisible();
}

export async function openCurrencyPicker(screen: Screen, currentCode: string): Promise<void> {
  await screen.getByText(currentCode, { exact: true }).tap();
  await expect(screen.getByText('Select Currency')).toBeVisible();
  await expect(searchInput(screen)).toBeVisible();
}

export async function selectCurrency(screen: Screen, currentCode: string, rowText: string): Promise<void> {
  await openCurrencyPicker(screen, currentCode);
  await screen.getByText(rowText).tap();
  await expect(amountInput(screen)).toBeVisible();
}

export async function flattenTree(screen: Screen): Promise<ViewNode[]> {
  const flattened: ViewNode[] = [];
  const visit = (nodes: ViewNode[]): void => {
    for (const node of nodes) {
      flattened.push(node);
      visit(node.children);
    }
  };
  visit(await screen.viewTree());
  return flattened;
}

export async function visibleTexts(screen: Screen): Promise<string[]> {
  return (await flattenTree(screen))
    .filter(node => node.isVisible)
    .map(node => node.text ?? node.value ?? '')
    .filter(Boolean);
}

export async function readConversionResult(screen: Screen, targetCode: string): Promise<string | null> {
  const pattern = new RegExp(`^-?\\d+(?:\\.\\d+)? ${targetCode}$`);
  return (await visibleTexts(screen)).find(text => pattern.test(text)) ?? null;
}

export async function expectNoApplicationError(screen: Screen): Promise<void> {
  const texts = await visibleTexts(screen);
  const hasError = texts.some(text =>
    /Error:|keeps stopping|has stopped|Close app|NaN|Infinity/i.test(text),
  );
  expect(hasError, `Unexpected application error in visible text: ${texts.join(' | ')}`).toBe(false);
}

export async function getExchangeRate(device: Device, from: string, to: string): Promise<number> {
  if (from === to) {
    return 1;
  }
  const databasePath = join(tmpdir(), `vi-rates-${randomUUID()}.sqlite`);
  let database: DatabaseSync | undefined;
  try {
    const serial = await resolveAdbSerial(device);
    const { stdout } = await execFileAsync(
      adbCommand(),
      ['-s', serial, 'exec-out', 'run-as', process.env.ANDROID_APP_ID ?? 'com.vi', 'cat', 'databases/RKStorage'],
      { encoding: 'buffer', timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
    );
    await writeFile(databasePath, stdout);
    database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare('SELECT value FROM catalystLocalStorage WHERE key = ?').get(`${from}_${to}`) as { value: string | number } | undefined;
    const rate = Number(row?.value);
    if (Number.isFinite(rate)) {
      return rate;
    }
    const inverseRow = database.prepare('SELECT value FROM catalystLocalStorage WHERE key = ?').get(`${to}_${from}`) as { value: string | number } | undefined;
    const inverseRate = Number(inverseRow?.value);
    if (Number.isFinite(inverseRate) && inverseRate !== 0) {
      return 1 / inverseRate;
    }
    throw new Error(`Application storage does not contain a finite ${from}/${to} rate or its inverse`);
  } finally {
    database?.close();
    await unlink(databasePath).catch(() => undefined);
  }
}

function expectedResults(amount: number, targetCode: string, rates: number[]): string[] {
  return [...new Set(rates.map(rate => `${(amount * rate).toFixed(2)} ${targetCode}`))];
}

export async function expectConversion(
  screen: Screen,
  displayedAmount: string,
  numericAmount: number,
  from: string,
  to: string,
  rates: number[],
): Promise<string> {
  const expected = expectedResults(numericAmount, to, rates);
  await expect(screen.getByText(`${displayedAmount} ${from} =`)).toBeVisible();
  await expect.poll(
    async () => expected.includes(await readConversionResult(screen, to) ?? ''),
    {
      timeout: DEFAULT_EXPECT_TIMEOUT,
      message: `Expected one of ${expected.join(' or ')} for ${displayedAmount} ${from}/${to}`,
    },
  ).toBe(true);
  const actual = await readConversionResult(screen, to);
  if (actual === null) {
    throw new Error('Conversion result disappeared after a successful assertion');
  }
  return actual;
}

export async function fillAndExpectConversion(
  device: Device,
  screen: Screen,
  displayedAmount: string,
  from: string,
  to: string,
): Promise<string> {
  await amountInput(screen).fill(displayedAmount);
  await expect(screen.getByText(`${displayedAmount} ${from} =`)).toBeVisible();
  await expect.poll(async () => await readConversionResult(screen, to) !== null).toBe(true);
  const rate = await getExchangeRate(device, from, to);
  return expectConversion(screen, displayedAmount, Number(displayedAmount), from, to, [rate]);
}

export async function expectInsideViewport(device: Device, locator: Locator): Promise<Bounds> {
  const [box, viewport] = await Promise.all([locator.boundingBox(), device.screenSize()]);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  return box;
}

export function boxesOverlap(first: Bounds, second: Bounds): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function adbCommand(): string {
  if (process.env.ANDROID_ADB_PATH) {
    return process.env.ANDROID_ADB_PATH;
  }
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return androidHome ? join(androidHome, 'platform-tools', 'adb') : join(homedir(), 'Library/Android/sdk/platform-tools/adb');
}

const adbSerialCache = new Map<string, string>();

function normalizedDeviceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function resolveAdbSerial(device: Device): Promise<string> {
  if (process.env.ANDROID_DEVICE_ID) {
    return process.env.ANDROID_DEVICE_ID;
  }
  const cached = adbSerialCache.get(device.id);
  if (cached) {
    return cached;
  }
  const { stdout } = await execFileAsync(adbCommand(), ['devices'], { timeout: 10_000 });
  const serials = stdout.split('\n').slice(1).flatMap(line => {
    const [serial, state] = line.trim().split(/\s+/);
    return serial && state === 'device' ? [serial] : [];
  });
  if (serials.includes(device.id)) {
    adbSerialCache.set(device.id, device.id);
    return device.id;
  }
  for (const serial of serials) {
    const { stdout: avdName } = await execFileAsync(
      adbCommand(),
      ['-s', serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'],
      { timeout: 10_000 },
    );
    if (normalizedDeviceName(avdName.trim()) === normalizedDeviceName(device.id)) {
      adbSerialCache.set(device.id, serial);
      return serial;
    }
  }
  const onlySerial = serials[0];
  if (serials.length === 1 && onlySerial) {
    adbSerialCache.set(device.id, onlySerial);
    return onlySerial;
  }
  throw new Error(`Unable to map Mobilewright device ${device.id} to an ADB serial`);
}

export async function adb(device: Device, args: string[]): Promise<string> {
  const serial = await resolveAdbSerial(device);
  const { stdout } = await execFileAsync(adbCommand(), ['-s', serial, ...args], { timeout: 10_000 });
  return stdout.trim();
}

export async function setNetworkEnabled(device: Device, enabled: boolean): Promise<void> {
  const state = enabled ? 'enable' : 'disable';
  await adb(device, ['shell', 'svc', 'wifi', state]);
  await adb(device, ['shell', 'svc', 'data', state]);
  await new Promise(resolve => setTimeout(resolve, enabled ? 2_500 : 1_500));
}

export async function selectNonDefaultPair(screen: Screen): Promise<void> {
  await selectCurrency(screen, 'USD', 'EUR - Euro');
  await expectCurrencyPair(screen, 'EUR', 'CAD');
}
