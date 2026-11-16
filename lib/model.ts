// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols the watchlist leaves out: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE x (category multiple / 0.25)
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   reach      = 1 + min(chains, 8) / 8 x REACH_WEIGHT
//   implied    = max(1, round(base x growthMult x maturity x reach))
//
// The category multiple is the radar's own reading of how much of its TVL a category's token tends to
// hold; it is stated on the dashboard beside the other constants, and the page recomputes every row so
// the number in board.json and the number on screen come from the same arithmetic. No protocol name is
// ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_weight: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  reach_weight: 0.2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols the watchlist leaves out that the early radar adds, by implied value. */
export const EARLY_ROWS = 220;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/**
 * A category's own economics: how much of a protocol's TVL its token tends to hold (its multiple), what
 * a farmer does there, what the protocol rewards and how much work it is. Keyed by a substring of
 * DefiLlama's category, first match wins; the fallback covers every other category, so one the snapshot
 * adds later is scored like any other, never skipped and never named.
 */
interface CategoryProfile {
  match: string[];
  multiple: number;
  action: string;
  points: string;
  effort: string;
}

const PROFILES: CategoryProfile[] = [
  { match: ['liquid restaking', 'liquid restak', 'restak'], multiple: 0.34, action: 'Restake', points: 'restaking points, usually per ETH deposited', effort: 'low' },
  { match: ['liquid staking', 'staking pool', 'staking'], multiple: 0.3, action: 'Stake', points: 'staking points and a liquid receipt token', effort: 'low' },
  { match: ['dex'], multiple: 0.26, action: 'Provide liquidity', points: 'liquidity points per dollar-hour plus swap volume', effort: 'medium' },
  { match: ['yield aggregator', 'leveraged farm', 'yield', 'farm'], multiple: 0.24, action: 'Deposit', points: 'deposit points, sometimes boosted in a new vault', effort: 'low' },
  { match: ['lending', 'cdp', 'collateral'], multiple: 0.22, action: 'Lend', points: 'supply and borrow points, per dollar of debt and per day', effort: 'medium' },
  { match: ['prediction'], multiple: 0.21, action: 'Take a position', points: 'market-volume points', effort: 'low' },
  { match: ['perpetual', 'derivative', 'synthetic', 'options', 'basis'], multiple: 0.2, action: 'Trade', points: 'volume points, so turnover beats one deposit', effort: 'high' },
  { match: ['rwa', 'anchor btc', 'decentralized btc', 'restaked btc'], multiple: 0.19, action: 'Mint or deposit', points: 'mint points on the asset you hold', effort: 'medium' },
  { match: ['bridge', 'cross chain'], multiple: 0.18, action: 'Bridge', points: 'bridge-volume points per dollar moved', effort: 'low' },
  { match: ['index'], multiple: 0.18, action: 'Mint the index', points: 'index points on minted units', effort: 'low' },
  { match: ['risk curator', 'capital allocator', 'liquidity manager'], multiple: 0.16, action: 'Allocate', points: 'curator points on the vault you pick, if the curator runs one', effort: 'low' },
  { match: ['stable'], multiple: 0.15, action: 'Mint', points: 'stability points on the minted supply', effort: 'low' },
  { match: ['insurance'], multiple: 0.14, action: 'Buy cover', points: 'cover points on the premium paid', effort: 'low' },
  { match: ['launchpad', 'token locker', 'payments', 'crypto card', 'privacy', 'governance'], multiple: 0.12, action: 'Use', points: 'usage points, thin for a passive holder', effort: 'low' },
  { match: ['cex'], multiple: 0.08, action: 'Deposit', points: 'none: an exchange pays no farming rewards', effort: 'none' },
];

/** The profile a category no row above names gets, and a protocol with no category. */
const FALLBACK: CategoryProfile = { match: [], multiple: 0.17, action: 'Deposit', points: 'points if the protocol runs a programme, otherwise nothing', effort: 'medium' };

/** The profile a protocol's category gets. */
export function profileFor(p: SnapshotProtocol): CategoryProfile {
  const c = (p.category ?? '').toLowerCase();
  for (const profile of PROFILES) for (const m of profile.match) if (c.includes(m)) return profile;
  return FALLBACK;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  signal: {
    liquidity: number;
    momentum: number;
    novelty: number;
    reach: number;
    score: number;
    verdict: string;
  };
  model: {
    base_multiple: number;
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  plan: {
    action: string;
    capital_usd: number;
    hold_days: number;
    setup_minutes: number;
    weekly_minutes: number;
    effort: string;
    points: string;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row: its figures, its signals and its plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  signal: BoardRow['signal'];
  plan: BoardRow['plan'];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_over_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_protocols: number;
  category_medians: Record<string, number>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; categoryMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMult = profileFor(protocol).multiple;
  const reachMult = 1 + (Math.min(protocol.chains.length, 8) / 8) * model.reach_weight;
  const base = protocol.tvl_usd * model.base_multiple * (categoryMult / 0.25);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  return { implied, growthPct, growthMult, maturityMult, reachMult, categoryMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories whose records are a staked, bridged or wrapped product rather than a protocol of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The words that mark a name as a staked or wrapped version of a token that already trades. */
const PRODUCT_WORDS = /(^|\s)(wrapped|staked|staking)(\s|$)/i;

/** The exchanges whose name at the front of a protocol marks a staking product of theirs. */
const EXCHANGES = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: it records no token of its own, it is not a staked,
 * bridged or wrapped product of a token that already trades, and it is not a versioned pool. The radar
 * applies the same rules to every record, so a product never takes a rank a pre-token protocol earned.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || PRODUCT_WORDS.test(p.name) || EXCHANGES.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The 0..100 signals a row carries beside its value: why it is worth farming, at a glance. */
function signalFor(p: SnapshotProtocol, age: number | null): BoardRow['signal'] {
  const liquidity = Math.round(clamp((Math.log10(Math.max(p.tvl_usd, 1)) - 6) / 4, 0, 1) * 100);
  const momentum = Math.round(clamp((clamp(finite(p.change_7d, 0), -40, 60) + 40) / 100, 0, 1) * 100);
  const novelty = age === null ? 50 : Math.round(clamp(1 - Math.min(age, 900) / 900, 0, 1) * 100);
  const reach = Math.round(clamp(p.chains.length / 8, 0, 1) * 100);
  const score = Math.round(liquidity * 0.3 + momentum * 0.25 + novelty * 0.25 + reach * 0.2);
  const verdict = score >= 65 ? 'Farm now' : score >= 50 ? 'Worth a position' : score >= 35 ? 'Watch' : 'Low priority';
  return { liquidity, momentum, novelty, reach, score, verdict };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The protocol's one action, in the words a farmer can follow, from its category's profile. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const profile = profileFor(p);
  const name = p.name;
  switch (profile.action) {
    case 'Restake':
      return `Restake $${capital} of ETH or the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
    case 'Stake':
      return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep its liquid receipt.`;
    case 'Provide liquidity':
      return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
    case 'Lend':
      return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a stable against half of it and keep both positions open.`;
    case 'Take a position':
      return `Fund $${capital} of USDC on ${name} and place one market position, then a second in the next round.`;
    case 'Trade':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and turn it over a few times a month, never above 2x leverage.`;
    case 'Mint or deposit':
      return `Mint or deposit $${capital} of the protocol's asset through ${name} on ${chain} and hold the receipt.`;
    case 'Bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in its own app.`;
    case 'Mint the index':
      return `Mint $${capital} of the ${name} index on ${chain} and hold the units in one wallet.`;
    case 'Allocate':
      return `Allocate $${capital} of USDC to a ${name} vault on ${chain} and keep the vault shares for the season.`;
    case 'Mint':
      return `Mint $${capital} of the protocol's stable asset through ${name} on ${chain} and keep it in the same wallet.`;
    case 'Buy cover':
      return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the season.`;
    case 'Use':
      return `Use ${name} on ${chain} with $${capital} of the asset it takes and keep the account active each week.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const profile = profileFor(p);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  const other = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(' and ')}, so pick the cheapest chain to move funds to.` : '';
  return [
    {
      text: 'Open a wallet that holds only the funds you farm with, keep its seed phrase offline, and write down the address you farm from.',
      cost: 'no money, only a wallet',
      time: '5 minutes, once',
    },
    {
      text: `${action}${other}`,
      cost: `$${capital} of capital and about $${gas} of gas for the first transaction`,
      time: '15 minutes to set up',
    },
    {
      text: 'Repeat one qualifying action every week (a deposit, a swap, a borrow or a vote) so the activity lands in more than one snapshot.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days: ${profile.action.toLowerCase()} rewards are counted per day open, not per click.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own page or docs for a points programme or a claim link, and claim only from a link the protocol publishes itself.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and each transaction in a farm log, so you can repeat the position next season or unwind it in one go.',
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols the watchlist leaves out, strongest implied value first, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const profile = profileFor(s.p);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      signal: signalFor(s.p, s.v.age),
      model: {
        base_multiple: model.base_multiple,
        category_multiple: round4(s.v.categoryMult),
        growth_pct: round4(s.v.growthPct),
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        reach_multiplier: round4(s.v.reachMult),
        age_days: s.v.age,
      },
      plan: {
        action: profile.action,
        capital_usd: capitalFor(s.p),
        hold_days: holdDaysFor(s.v.age),
        setup_minutes: 30,
        weekly_minutes: 10,
        effort: profile.effort,
        points: profile.points,
      },
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
    } satisfies BoardRow;
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_over_tvl: p.mcap_usd === null || p.tvl_usd === 0 ? null : round4(p.mcap_usd / p.tvl_usd),
    }));
}

/** A board row's compact form for data.js, with the plan's prose generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    on_watchlist: watchlist.has(row.slug),
    signal: row.signal,
    plan: row.plan,
  };
}

/** The median implied value of each category the board ranks: the page's "vs. its category" line. */
function categoryMedians(board: BoardRow[]): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const r of board) {
    const key = r.category ?? 'Other';
    const list = groups.get(key) ?? [];
    list.push(r.implied_value_usd);
    groups.set(key, list);
  }
  const out: Record<string, number> = {};
  for (const [key, list] of groups) {
    list.sort((a, b) => a - b);
    out[key] = list[Math.floor(list.length / 2)]!;
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_protocols: snapshot.protocols.length,
    category_medians: categoryMedians(board),
    rows: board.map((r) => radarRow(r, watch)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
