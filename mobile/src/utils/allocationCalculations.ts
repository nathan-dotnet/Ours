/**
 * Pure math for the Money Calculator — combined income, the Budget/Savings/Wants split, and the
 * Savings sub-split across goals. Mirrors the backend's DistributionService exactly (same "last
 * share absorbs the rounding remainder" technique) so a preview shown here always matches what
 * the server actually records; the server still re-derives every amount itself rather than
 * trusting these, per DistributionService's own doc comment.
 *
 * Percentages are parsed/compared as integer "basis points" (percent × 100) rather than raw JS
 * numbers — the same reasoning utils/money.ts applies to pesos: `33.33 + 33.33 + 33.34` can fail
 * to equal exactly `100` in floating point, but `3333 + 3333 + 3334 === 10000` never does.
 */

const BASIS_POINTS_PER_PERCENT = 100; // 2 decimal places of percent precision
const FULL_ALLOCATION_BASIS_POINTS = 100 * BASIS_POINTS_PER_PERCENT; // 10,000 = "100.00%"

/**
 * Parses raw percent text (e.g. "33.33" from an allocation field) the same way
 * parseAmountInputToCents parses money — a non-negative number with at most 2 decimal places, at
 * most 100. Returns null for anything else (empty, negative, more than 2 decimals, over 100,
 * non-numeric).
 */
export function parsePercentInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return value <= 100 ? value : null;
}

/** Converts a percent (as a plain number, e.g. from parsePercentInput) into exact integer basis points — never a floating-point value. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * BASIS_POINTS_PER_PERCENT);
}

/**
 * True only when every percent is present and they sum to *exactly* `targetPercent` — compared
 * as integer basis points so 33.33+33.33+33.34 reliably equals 100 (or any other target, e.g. a
 * couple's Wants split — see the Money Calculator's "Mine %"/"Hers %" rows, which must sum to
 * exactly the couple's overall Wants percent, not to 100).
 */
export function sumsToExactlyPercent(percents: (number | null)[], targetPercent: number): boolean {
  if (percents.some((p) => p === null)) return false;
  const totalBasisPoints = (percents as number[]).reduce((sum, p) => sum + percentToBasisPoints(p), 0);
  return totalBasisPoints === percentToBasisPoints(targetPercent);
}

/** True only when every percent is present and they sum to *exactly* 100 — compared as integer basis points so 33.33+33.33+33.34 reliably equals 100. */
export function sumsToExactly100(percents: (number | null)[]): boolean {
  return sumsToExactlyPercent(percents, 100);
}

/**
 * Splits `totalCents` proportionally across `weights` (which must already sum to exactly
 * `weightSum`) so the resulting amounts always sum to exactly `totalCents` — every share but the
 * last is rounded normally; the last is whatever makes the total exact. This is what prevents
 * several roundings of a whole from ever landing a cent short or over.
 */
export function splitProportionally(totalCents: number, weights: number[], weightSum: number): number[] {
  const amounts: number[] = [];
  let runningTotal = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const amount = Math.round((totalCents * weights[i]) / weightSum);
    amounts.push(amount);
    runningTotal += amount;
  }
  amounts.push(totalCents - runningTotal);
  return amounts;
}

/** Splits `totalCents` across `percents` (which must already sum to exactly 100) the same way splitProportionally does. */
export function splitExactly(totalCents: number, percents: number[]): number[] {
  return splitProportionally(totalCents, percents, 100);
}

/**
 * Re-expresses `shares` (which must already sum to exactly `shareSum`, e.g. each member's income-
 * relative Wants percent, summing to the couple's overall Wants percent) as percentages of that
 * same pool that sum to *exactly* 100.00 — what WantsAllocationInputDto.allocationPercent needs
 * on the wire, since the server computes each member's peso amount as a share of the already-
 * computed Wants amount, not of combined income directly (see DistributionService). Uses the same
 * "last share absorbs the remainder" technique, in basis points, so the result always sums to
 * exactly 100 regardless of rounding.
 */
export function reexpressAsPercentOf(shares: number[], shareSum: number): number[] {
  if (shareSum <= 0) {
    // Nothing meaningful to divide — fall back to an even split so every entry is still a valid,
    // summing-to-100 percent (the resulting amounts will all be ₱0 either way).
    return splitProportionally(FULL_ALLOCATION_BASIS_POINTS, shares.map(() => 1), shares.length).map(
      (bp) => bp / BASIS_POINTS_PER_PERCENT,
    );
  }
  const basisPoints: number[] = [];
  let runningTotal = 0;
  for (let i = 0; i < shares.length - 1; i++) {
    const bp = Math.round((shares[i] / shareSum) * FULL_ALLOCATION_BASIS_POINTS);
    basisPoints.push(bp);
    runningTotal += bp;
  }
  basisPoints.push(FULL_ALLOCATION_BASIS_POINTS - runningTotal);
  return basisPoints.map((bp) => bp / BASIS_POINTS_PER_PERCENT);
}

export function calculateCombinedIncomeCents(yourIncomeCents: number, partnerIncomeCents: number): number {
  return yourIncomeCents + partnerIncomeCents;
}

/**
 * One bucket's share of combined income, for *display* (e.g. the Budget tab's headline figure)
 * rather than an actual distribution — a plain rounding is fine here since there's no sibling
 * bucket it must reconcile against; only Distribute Money's three-way split needs splitExactly.
 */
export function calculateBucketAmountCents(combinedIncomeCents: number, percent: number): number {
  return Math.round((combinedIncomeCents * percent) / 100);
}
