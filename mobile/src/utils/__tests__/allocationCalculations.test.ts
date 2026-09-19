import {
  calculateBucketAmountCents,
  calculateCombinedIncomeCents,
  parsePercentInput,
  percentToBasisPoints,
  reexpressAsPercentOf,
  splitExactly,
  splitProportionally,
  sumsToExactly100,
  sumsToExactlyPercent,
} from '../allocationCalculations';

describe('parsePercentInput', () => {
  it('accepts a plain whole percentage', () => {
    expect(parsePercentInput('50')).toBe(50);
  });

  it('accepts up to two decimal places', () => {
    expect(parsePercentInput('33.33')).toBe(33.33);
  });

  it('rejects more than two decimal places', () => {
    expect(parsePercentInput('33.333')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('   ')).toBeNull();
  });

  it('rejects negative values', () => {
    expect(parsePercentInput('-10')).toBeNull();
  });

  it('rejects values over 100', () => {
    expect(parsePercentInput('100.01')).toBeNull();
    expect(parsePercentInput('150')).toBeNull();
  });

  it('accepts exactly 0 and exactly 100', () => {
    expect(parsePercentInput('0')).toBe(0);
    expect(parsePercentInput('100')).toBe(100);
  });

  it('rejects non-numeric input', () => {
    expect(parsePercentInput('abc')).toBeNull();
    expect(parsePercentInput('50%')).toBeNull();
  });
});

describe('sumsToExactly100', () => {
  it('is true for a clean 50/30/20 split', () => {
    expect(sumsToExactly100([50, 30, 20])).toBe(true);
  });

  it('is true for an uneven three-way split that still sums to exactly 100', () => {
    expect(sumsToExactly100([33.33, 33.33, 33.34])).toBe(true);
  });

  it('is robust to floating-point noise that plain addition would not be (compares via integer basis points)', () => {
    // 0.1 + 0.2 !== 0.3 in raw JS float math — the same class of error this must never inherit.
    expect(0.1 + 0.2 === 0.3).toBe(false); // sanity check the float trap is real
    expect(sumsToExactly100([0.1, 0.2, 99.7])).toBe(true);
  });

  it('is false when the total is under 100', () => {
    expect(sumsToExactly100([50, 30, 10])).toBe(false);
  });

  it('is false when the total is over 100', () => {
    expect(sumsToExactly100([50, 30, 30])).toBe(false);
  });

  it('is false when any percent is null (not yet entered)', () => {
    expect(sumsToExactly100([50, null, 20])).toBe(false);
  });
});

describe('percentToBasisPoints', () => {
  it('converts a percent with two decimals to exact integer basis points', () => {
    expect(percentToBasisPoints(33.33)).toBe(3333);
    expect(percentToBasisPoints(100)).toBe(10000);
    expect(percentToBasisPoints(0)).toBe(0);
  });
});

describe('splitExactly', () => {
  it('splits a whole amount three ways and reconciles exactly, even with an uneven split', () => {
    const amounts = splitExactly(10_000_00, [33.33, 33.33, 33.34]); // ₱10,000.00 in cents
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10_000_00);
  });

  it('matches the spec\'s worked example: ₱50,000 at 50/30/20', () => {
    const amounts = splitExactly(50_000_00, [50, 30, 20]);
    expect(amounts).toEqual([25_000_00, 15_000_00, 10_000_00]);
  });

  it('never produces 14,999.99 or 15,000.01 style rounding errors', () => {
    // ₱100.00 split three equal-ish ways is the classic case that breaks naive per-share rounding.
    const amounts = splitExactly(100_00, [33.33, 33.33, 33.34]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100_00);
    expect(amounts.every((a) => Number.isInteger(a))).toBe(true);
  });

  it('handles a single 100% share as the whole amount', () => {
    expect(splitExactly(5_000_00, [100])).toEqual([5_000_00]);
  });
});

describe('calculateBucketAmountCents', () => {
  it('matches the spec\'s worked example: 50% of ₱50,000 is ₱25,000', () => {
    expect(calculateBucketAmountCents(50_000_00, 50)).toBe(25_000_00);
  });

  it('rounds to the nearest cent', () => {
    expect(calculateBucketAmountCents(100, 33.33)).toBe(33); // 33.33 rounds down
  });
});

describe('sumsToExactlyPercent', () => {
  it('is true when a couple\'s Wants split (Mine/Hers) sums to exactly the Wants percent, not to 100', () => {
    // Wants = 20% overall — Mine=12%, Hers=8% is a valid, customized split of it.
    expect(sumsToExactlyPercent([12, 8], 20)).toBe(true);
  });

  it('is false when the split does not match the target percent', () => {
    expect(sumsToExactlyPercent([12, 7], 20)).toBe(false);
  });

  it('sumsToExactly100 is the target=100 case of this', () => {
    expect(sumsToExactly100([50, 30, 20])).toBe(sumsToExactlyPercent([50, 30, 20], 100));
  });
});

describe('splitProportionally', () => {
  it('splits a whole amount by weights that sum to something other than 100 (e.g. a Wants percent, not 100%)', () => {
    // Wants = ₱10,000, split Mine=12/Hers=8 (of the 20% Wants total, i.e. weightSum=20) -> 60/40.
    const amounts = splitProportionally(10_000_00, [12, 8], 20);
    expect(amounts).toEqual([6_000_00, 4_000_00]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10_000_00);
  });

  it('splitExactly is the weightSum=100 case of this', () => {
    expect(splitExactly(50_000_00, [50, 30, 20])).toEqual(splitProportionally(50_000_00, [50, 30, 20], 100));
  });
});

describe('reexpressAsPercentOf', () => {
  it("re-expresses a couple's income-relative Wants split as percentages of the Wants bucket itself, summing to exactly 100", () => {
    // Mine=12%, Hers=8% of total income, out of a 20% Wants bucket -> 60%/40% of that bucket.
    expect(reexpressAsPercentOf([12, 8], 20)).toEqual([60, 40]);
  });

  it('always sums to exactly 100, even when the division does not terminate cleanly', () => {
    const result = reexpressAsPercentOf([1, 2], 3); // 1/3 and 2/3 of the pool
    expect(result[0] + result[1]).toBe(100);
  });

  it('falls back to an even split rather than dividing by zero when the pool itself is zero', () => {
    const result = reexpressAsPercentOf([0, 0], 0);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('calculateCombinedIncomeCents', () => {
  it('adds both incomes', () => {
    expect(calculateCombinedIncomeCents(30_000_00, 20_000_00)).toBe(50_000_00);
  });

  it('handles one side being zero', () => {
    expect(calculateCombinedIncomeCents(50_000_00, 0)).toBe(50_000_00);
  });
});
