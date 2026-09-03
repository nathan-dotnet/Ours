import {
  apiAmountToCents,
  centsToAmountInput,
  centsToApiAmount,
  formatMoney,
  parseAmountInputToCents,
  sumCents,
} from '../money';

describe('parseAmountInputToCents', () => {
  it('parses a whole number', () => {
    expect(parseAmountInputToCents('100')).toBe(10000);
  });

  it('parses one and two decimal places', () => {
    expect(parseAmountInputToCents('100.1')).toBe(10010);
    expect(parseAmountInputToCents('100.10')).toBe(10010);
    expect(parseAmountInputToCents('0.99')).toBe(99);
  });

  it('rejects garbage, negative, and more than 2 decimal places', () => {
    expect(parseAmountInputToCents('abc')).toBeNull();
    expect(parseAmountInputToCents('-5.00')).toBeNull();
    expect(parseAmountInputToCents('5.001')).toBeNull();
    expect(parseAmountInputToCents('')).toBeNull();
    expect(parseAmountInputToCents('5.')).toBeNull();
  });
});

describe('centsToAmountInput / parseAmountInputToCents round trip', () => {
  it('round-trips exactly for tricky values', () => {
    for (const cents of [1, 99, 100, 10010, 20, 199999, 1]) {
      expect(parseAmountInputToCents(centsToAmountInput(cents))).toBe(cents);
    }
  });
});

describe('apiAmountToCents / centsToApiAmount', () => {
  it('round-trips a typical decimal amount exactly', () => {
    expect(apiAmountToCents(100.3)).toBe(10030);
    expect(centsToApiAmount(10030)).toBe(100.3);
  });

  it('never produces a floating-point artifact like 100.30000000000001', () => {
    const cents = apiAmountToCents(100.1) + apiAmountToCents(0.2);
    expect(cents).toBe(10030);
    expect(centsToApiAmount(cents)).toBe(100.3);
  });
});

describe('sumCents — the money-precision requirement', () => {
  it('100.10 + 0.20 sums to exactly 100.30, not 100.30000000000001', () => {
    const total = sumCents([apiAmountToCents(100.1), apiAmountToCents(0.2)]);
    expect(centsToApiAmount(total)).toBe(100.3);
    // The classic float trap this whole module exists to avoid — proves it on a pair where it's
    // actually reproducible in native JS arithmetic (unlike 100.1 + 0.2, which happens not to be).
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('1999.99 + 0.01 sums to exactly 2000.00', () => {
    const total = sumCents([apiAmountToCents(1999.99), apiAmountToCents(0.01)]);
    expect(centsToApiAmount(total)).toBe(2000);
  });

  it('sums a longer list of amounts exactly', () => {
    const total = sumCents([250, 10050, 199999, 1]);
    expect(total).toBe(210300);
  });

  it('sums an empty list to zero', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats integer cents as a currency string', () => {
    expect(formatMoney(125050, 'PHP')).toContain('1,250.50');
  });

  it('falls back gracefully for a malformed currency code instead of throwing', () => {
    expect(() => formatMoney(100, 'NOTACURRENCY')).not.toThrow();
    expect(formatMoney(100, 'NOTACURRENCY')).toContain('1.00');
  });
});
