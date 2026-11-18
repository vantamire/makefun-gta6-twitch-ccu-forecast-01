// gta6-twitch-ccu-forecast-01 entry, v2 (Node 22, standard library only): forecast GTA VI's
// release-day Twitch concurrent viewers (CCU), hours 2..24 of 2026-11-19 UTC, as five
// quantiles per hour, from the case file alone. No network, no clock, no randomness:
// the same case file in writes a byte-identical forecast out.
//
// Model (v2 builds on v1, which is already accepted; the change is the spread — see below.
// Validated on the kit's four practice launches, whose real release-day hourly counts were
// fetched from SullyGnome, the same source the kit's comparables come from; the practice
// answers match each case's hour-1 print exactly, so the harness and the competition's own
// pinball loss on the log scale are verified end to end):
//
//   - Launch days do NOT stay flat: hour 1 (00:00-01:00 UTC) catches only the earliest
//     midnight-local unlocks (New Zealand, Australia, then the UK), while the US east
//     coast unlocks at 05:00 UTC and the west coast at 08:00 UTC, so viewership dips in
//     the small hours and then surges into the evening. Persistence (the house baseline)
//     misses that shape entirely.
//   - The shape depends on how big hour 1 already is: launches whose hour 1 was already
//     huge (Elden Ring 875k, Cyberpunk 852k — unlocked in a major market by 00:00 UTC)
//     stay roughly flat (peak log-ratio <= +0.3), while launches whose hour 1 was tiny
//     (a later unlock) explode 10-1000x by the evening. So for each hour h, take the
//     log-ratio ln(viewers_h / viewers_1) of every comparable launch's release day and
//     form a kernel-weighted median, weighting each comparable by how close its own
//     hour-1 count is to this case's hour-1 print in log space (Gaussian kernel,
//     bandwidth 1.0 log units), with console-only launches (platforms with no "PC")
//     weighted x2 — GTA VI is console-only (PS5 / Xbox Series X|S), and console-only
//     rolling-midnight launches are its closest kin.
//   - Spread, v2 change: v1 put ONE symmetric normal spread (the kernel-weighted SD) on
//     both sides of the median. That is the wrong shape for these ratios: across the
//     comparable pool itself, the log-ratios are strongly right-skewed at every hour
//     (skew +1.3 to +2.3, mean well above the median, worst downside about -1.4 log
//     units against upside explosions up to +7.5). A symmetric spread therefore prices
//     the lower tail too wide and the upper tail too narrow — and the pinball loss
//     punishes both mistakes. v2 instead takes two one-sided spreads: the
//     kernel-weighted semi-deviation of the ratios at or below the median (the lower
//     spread) and of the ratios at or above it (the upper spread), each floored at
//     0.15 and capped at 1.5 log units, the same floor and cap v1 used. Quantiles:
//     q_tau(h) = p1 * exp(median_h + z_tau * spread_h(tau)), z = (-1.645, -0.674, 0,
//     0.674, 1.645), where spread_h(tau) is the lower spread for tau < 0.5, the upper
//     spread for tau > 0.5, and the median itself at tau = 0.5. No number was fitted to
//     the practice answers: both spreads are computed from the case's own comparables
//     at run time, and the floor/cap are v1's unchanged constants. The median, kernel,
//     console boost and fallbacks are exactly v1's.
//   - Fallbacks: an hour with fewer than 3 comparables carrying data falls back to the
//     house baseline's persistence shape for that hour; with no usable comparables at
//     all the whole forecast is the baseline. A comparable whose release day is in the
//     future (e.g. GTA VI's own pre-release history) has no release-day hours and is
//     skipped automatically.
//
// Backtest (competition pinball loss, log scale, mean over 4 practice cases; lower better):
//   house baseline (persistence):  0.3871  [0.744 Wolverine, 0.287 RDR2, 0.215 GOW, 0.303 SM2]
//   v1 (symmetric spread):         0.2191  [0.361 Wolverine, 0.194 RDR2, 0.133 GOW, 0.189 SM2]
//   v2 (asymmetric spread):        0.2078  [0.323 Wolverine, 0.191 RDR2, 0.125 GOW, 0.192 SM2]
//   i.e. v2 beats v1 on three of the four practice cases (Wolverine -0.038, RDR2 -0.002,
//   God of War -0.008) and is a touch worse on Spider-Man 2 (+0.003). The TypeScript
//   entry itself was run on the four practice cases and reproduces those numbers exactly
//   (90% coverage 1.00, 0.96, 1.00, 0.83), and two runs are byte-identical. Variants
//   tried and rejected on the same four cases: IQR-based (robust) spread 0.227, empirical
//   weighted quantiles 0.242, smoothing the median profile 0.220, shrinking the spread
//   toward the pooled cross-hour spread 0.220, adding hour-1 channels as a second kernel
//   dimension 0.208 (a 0.00005 gain — noise, not worth the extra dimension), widening
//   the upper cap to 2.0/2.5 (no change — the cap never binds).
//
// Caveats, stated plainly: the practice is graded on past launches anyone can look up
// and pays nothing, so a practice score is no guide to the final (the rules say so too).
// Four practice cases is a small sample, and v2's gain over v1 is modest (-0.011 on
// average); the final's hour 1 will be GTA VI's own print, which no comparable can
// foresee, and the final score is only revealed after platform judging. The asymmetric
// spread is adopted because the skew it corrects is measured in the comparable pool
// itself, not because four practice numbers say so — but the final could still land
// either side of v1.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Gaussian kernel bandwidth on log(hour-1 viewers): how near a comparable's hour-1
 *  count must be to this case's to weigh heavily. */
const KERNEL_BANDWIDTH = 1.0;
/** Extra weight for console-only comparables (platforms with no "PC"): GTA VI is
 *  console-only, so rolling-midnight console launches are its closest kin. */
const CONSOLE_BOOST = 2.0;
/** Minimum comparables carrying an hour's data before the kernel profile is trusted. */
const MIN_COMPARABLES = 3;
/** Floor / cap on each one-sided log spread (the same constants v1 used for its
 *  single symmetric spread). */
const SPREAD_FLOOR = 0.15;
const SPREAD_CAP = 1.5;
/** House baseline spread, used only as a fallback (see header). */
const BASELINE_SIGMA = 0.15;

interface KnownRow {
  hour: number;
  viewers: number;
}

interface Comparable {
  name: string;
  day_start: string;
  platforms?: string;
  hourly: Array<{ from: string; viewers: number | null }>;
}

interface Case {
  levels: number[];
  known: KnownRow[];
  forecast: Array<{ hour: number }>;
  comparables: Comparable[];
}

/** x rounded to 2 decimals (half up), as the house baseline rounds it. */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Weighted median of values with weights: first value where cumulative weight reaches
 *  half the total. Pairs are sorted by (value, name) so the result is deterministic. */
function weightedMedian(pairs: Array<{ value: number; weight: number; name: string }>): number {
  const sorted = [...pairs].sort((a, b) => a.value - b.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = sorted.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  for (const p of sorted) {
    acc += p.weight;
    if (acc >= total / 2) return p.value;
  }
  return sorted[sorted.length - 1]!.value;
}

/** Weighted standard deviation of values around `centre`. */
function weightedSd(pairs: Array<{ value: number; weight: number }>, centre: number): number {
  const total = pairs.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return SPREAD_FLOOR;
  const variance = pairs.reduce((s, p) => s + p.weight * (p.value - centre) * (p.value - centre), 0) / total;
  return Math.sqrt(Math.max(0, variance));
}

/**
 * One-sided weighted spread around `centre`: the semi-deviation of the values on one
 * side of it. For a symmetric distribution each side's semi-deviation equals the full
 * SD; for the right-skewed launch-day log-ratios the lower side comes out smaller
 * and the upper side larger, which is exactly the asymmetry the pinball loss prices.
 * A side with fewer than 2 pairs falls back to the full SD so the estimate never
 * rests on a single point. The result is floored and capped like v1's spread.
 */
function oneSidedSpread(
  pairs: Array<{ value: number; weight: number }>,
  centre: number,
  side: 'below' | 'above',
): number {
  const oneSide = pairs.filter((p) => (side === 'below' ? p.value <= centre : p.value >= centre));
  const sd = oneSide.length >= 2 ? weightedSd(oneSide, centre) : weightedSd(pairs, centre);
  return Math.min(SPREAD_CAP, Math.max(SPREAD_FLOOR, sd));
}

/** The persistence (house baseline) quantiles for one hour, used only as a fallback. */
function baselineQuantiles(p1: number, h: number): number[] {
  return Z.map((z) => round2(Math.max(1, p1 * Math.exp(z * BASELINE_SIGMA * Math.sqrt(h - 1)))));
}

/** Forecast one case: five quantiles per hour, hours 2..24. */
function forecastCase(c: Case): { hours: Array<{ hour: number; q: number[] }> } {
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  }
  const first = c.known.find((k) => k.hour === 1);
  if (first === undefined) throw new Error('has no hour-1 print');
  const p1 = Math.max(1, first.viewers);
  const logP1 = Math.log(p1);

  // Per comparable, its release-day log-ratios ln(viewers_h / viewers_1), h = 1..24,
  // plus its kernel weight against this case's hour-1 print. A comparable with no
  // release-day data (its day is in the future, or its hour 1 is missing / <= 0)
  // contributes nothing.
  interface Comp {
    name: string;
    weight: number;
    ratios: Array<number | null>;
  }
  const comps: Comp[] = [];
  for (const comp of c.comparables ?? []) {
    const dayStart = Date.parse(comp.day_start);
    if (Number.isNaN(dayStart)) continue;
    const byHour = new Map<number, number>();
    for (const row of comp.hourly ?? []) {
      const at = Date.parse(row.from);
      if (Number.isNaN(at) || row.viewers === null || row.viewers === undefined) continue;
      const h = Math.round((at - dayStart) / 3600000) + 1;
      if (h >= 1 && h <= 24 && !byHour.has(h)) byHour.set(h, row.viewers);
    }
    const v1 = byHour.get(1);
    if (v1 === undefined || v1 <= 0) continue;
    const logV1 = Math.log(Math.max(1, v1));
    const d = (logV1 - logP1) / KERNEL_BANDWIDTH;
    let weight = Math.exp(-0.5 * d * d);
    const platforms = comp.platforms ?? '';
    if (!platforms.includes('PC')) weight *= CONSOLE_BOOST;
    const ratios: Array<number | null> = [];
    for (let h = 1; h <= 24; h++) {
      const v = byHour.get(h);
      ratios.push(v === undefined ? null : Math.log(Math.max(1, v) / Math.max(1, v1)));
    }
    comps.push({ name: comp.name, weight, ratios });
  }

  const hours = c.forecast.map(({ hour }) => {
    const pairs: Array<{ value: number; weight: number; name: string }> = [];
    for (const comp of comps) {
      const r = comp.ratios[hour - 1];
      if (r !== null && r !== undefined) pairs.push({ value: r, weight: comp.weight, name: comp.name });
    }
    if (pairs.length < MIN_COMPARABLES) return { hour, q: baselineQuantiles(p1, hour) };
    const median = weightedMedian(pairs);
    const spreadLo = oneSidedSpread(pairs, median, 'below');
    const spreadHi = oneSidedSpread(pairs, median, 'above');
    const q = Z.map((z) => {
      const spread = z < 0 ? spreadLo : z > 0 ? spreadHi : 0;
      return round2(Math.min(1e9, Math.max(1, p1 * Math.exp(median + z * spread))));
    });
    // Rounding can only keep the order (exp is monotone in z); enforce it anyway.
    for (let i = 1; i < q.length; i++) if (q[i]! < q[i - 1]!) q[i] = q[i - 1]!;
    return { hour, q };
  });
  return { hours };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(forecastCase(c))}\n`);
}
