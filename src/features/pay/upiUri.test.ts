import { describe, expect, test } from '@jest/globals';

import { amountToPaise, buildPayUri, normalizeIndianPhone, parseUpiUri, upiNumberVpa } from './upiUri';

const MERCHANT =
  'upi://pay?pa=applestore@hdfcbank&pn=Apple%20Store%2C%20BKC&am=5900.00&cu=INR&mc=5732&tr=AS-2041-8831';

describe('parseUpiUri', () => {
  test('reads a merchant QR', () => {
    expect(parseUpiUri(MERCHANT)).toEqual({
      rawUri: MERCHANT,
      pa: 'applestore@hdfcbank',
      pn: 'Apple Store, BKC',
      am: '5900.00',
      cu: 'INR',
      tn: undefined,
      tr: 'AS-2041-8831',
      mc: '5732',
      sign: undefined,
    });
  });

  test('accepts upper-case scheme and keys, trims whitespace', () => {
    expect(parseUpiUri('  UPI://PAY?PA=rohan.m@okaxis&PN=Rohan  ')).toMatchObject({
      pa: 'rohan.m@okaxis',
      pn: 'Rohan',
      am: undefined,
    });
  });

  test.each([
    ['not a UPI link', 'https://example.com/?pa=a@b'],
    ['upi but not pay', 'upi://mandate?pa=rohan@okaxis'],
    ['missing pa', 'upi://pay?pn=Rohan&am=10'],
    ['bad VPA', 'upi://pay?pa=rohan'],
    ['bad VPA handle', 'upi://pay?pa=rohan@1bank'],
    ['non-INR', 'upi://pay?pa=rohan@okaxis&am=10&cu=USD'],
    ['zero amount', 'upi://pay?pa=rohan@okaxis&am=0'],
    ['non-numeric amount', 'upi://pay?pa=rohan@okaxis&am=ten'],
    ['negative amount', 'upi://pay?pa=rohan@okaxis&am=-5'],
    ['signed QR without an amount', 'upi://pay?pa=shop@ybl&sign=MEUCIQDabc'],
    ['empty', ''],
  ])('rejects %s', (_, text) => {
    expect(parseUpiUri(text)).toBeNull();
  });
});

test('amountToPaise rounds to whole paise', () => {
  expect(amountToPaise('5900.00')).toBe(590000);
  expect(amountToPaise('0.1')).toBe(10);
  expect(amountToPaise('19.999')).toBe(2000);
});

describe('buildPayUri', () => {
  test('passes a merchant QR with an amount through unchanged', () => {
    const d = parseUpiUri(MERCHANT)!;
    expect(buildPayUri(d, 1, 'ignored')).toBe(MERCHANT);
  });

  test('passes a signed QR with an amount through unchanged', () => {
    const raw = 'upi://pay?pa=shop@ybl&pn=Shop&am=250.00&sign=MEUCIQDabc';
    expect(buildPayUri(parseUpiUri(raw)!, 1)).toBe(raw);
  });

  test('encodes spaces as %20, never +, and escapes reserved characters', () => {
    const uri = buildPayUri(
      parseUpiUri('upi://pay?pa=rohan@okaxis&pn=Rohan%20M')!,
      100,
      'Rent & bills',
    );
    expect(uri).toBe(
      'upi://pay?pa=rohan%40okaxis&pn=Rohan%20M&am=1.00&cu=INR&tn=Rent%20%26%20bills',
    );
    expect(uri).not.toContain('+');
  });

  test('trims the note to 50 characters', () => {
    const uri = buildPayUri(parseUpiUri('upi://pay?pa=rohan@okaxis')!, 100, 'x'.repeat(80));
    expect(new URLSearchParams(uri.split('?')[1]).get('tn')).toHaveLength(50);
  });

  test('builds a fresh link for a personal QR', () => {
    const uri = buildPayUri(
      parseUpiUri('upi://pay?pa=rohan.m@okaxis&pn=Rohan%20M')!,
      12550,
      'Dinner',
    );
    const q = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(Object.fromEntries(q)).toEqual({
      pa: 'rohan.m@okaxis',
      pn: 'Rohan M',
      am: '125.50',
      cu: 'INR',
      tn: 'Dinner',
    });
  });
});

describe('upiNumberVpa', () => {
  test.each([
    ['+91 98765 43210', '9876543210@upi'],
    ['098765-43210', '9876543210@upi'],
    ['9876543210', '9876543210@upi'],
    ['919876543210', '9876543210@upi'],
  ])('%s → %s', (input, out) => expect(upiNumberVpa(input)).toBe(out));

  test.each(['1234567890', '022 2345 6789', '98765', '+1 415 555 0100'])('rejects %s', (input) =>
    expect(upiNumberVpa(input)).toBeNull(),
  );
});

describe('normalizeIndianPhone', () => {
  test.each([
    ['+91 98765 43210', '9876543210'],
    ['098765-43210', '9876543210'],
    ['9876543210', '9876543210'],
    ['919876543210', '9876543210'],
  ])('%s → %s', (input, out) => expect(normalizeIndianPhone(input)).toBe(out));

  test.each(['1234567890', '022 2345 6789', '98765', '+1 415 555 0100'])('rejects %s', (input) =>
    expect(normalizeIndianPhone(input)).toBeNull(),
  );
});
