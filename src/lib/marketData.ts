import currentLeague from "../data/current-league.json";
import type { HistoryEntry, ItemEntry, MarketItem } from "../types";

// The active league's own name/version/start date, from current-league.json
// — distinct from LEAGUES, which are just sample datasets for the app.
export const CURRENT_LEAGUE_INFO = currentLeague;

type ItemEntryModules = Record<string, { default: ItemEntry[] }>;

// The category a JSON file's items are filed under is the file's own name
// (currency.json -> "Currency"), not whatever category poe.ninja happened
// to tag them with — poe.ninja isn't consistent about it (e.g. the same
// Vaal Orb items are "Vaal" in one league's data and "Incursion" in
// another's).
function categoryFromModulePath(path: string): string {
  const fileName = path
    .split("/")
    .pop()!
    .replace(/\.json$/, "");
  return fileName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Every league's item data lives in its own folder as one or more JSON
// files (e.g. currency.json, uniques.json); all of them are merged
// together, so adding a new file to a league's folder is enough to bring
// its items in.
function mergeItemEntryModules(modules: ItemEntryModules): ItemEntry[] {
  return Object.entries(modules).flatMap(([path, module]) => {
    const category = categoryFromModulePath(path);
    return module.default.map((entry) => ({
      ...entry,
      item: { ...entry.item, category },
    }));
  });
}

const runesOfAldurModules = import.meta.glob("../data/runes-of-aldur/*.json", {
  eager: true,
}) as ItemEntryModules;
const fateOfTheVaalModules = import.meta.glob(
  "../data/fate-of-the-vaal/*.json",
  { eager: true },
) as ItemEntryModules;
const riseOfTheAbyssalModules = import.meta.glob(
  "../data/rise-of-the-abyssal/*.json",
  { eager: true },
) as ItemEntryModules;

export interface League {
  id: string;
  name: string;
  color: string;
  itemEntries: ItemEntry[];
}

export const LEAGUES: League[] = [
  {
    id: "runes-of-aldur",
    name: "Runes of Aldur",
    color: "#2c8ed4",
    itemEntries: mergeItemEntryModules(runesOfAldurModules),
  },
  {
    id: "fate-of-the-vaal",
    name: "Fate of the Vaal",
    color: "#d94a4a",
    itemEntries: mergeItemEntryModules(fateOfTheVaalModules),
  },
  {
    id: "rise-of-the-abyssal",
    name: "Rise of the Abyssal",
    color: "#04c514",
    itemEntries: mergeItemEntryModules(riseOfTheAbyssalModules),
  },
];

export const DEFAULT_LEAGUE_ID = LEAGUES[0].id;

// Every item category found across every league, e.g. "Currency", "Vaal",
// "Fragments". Drives the category filter toggles.
export const ALL_CATEGORIES: string[] = [
  ...new Set(
    LEAGUES.flatMap((league) =>
      league.itemEntries.map((entry) => entry.item.category),
    ),
  ),
].sort();

// Leagues with their itemEntries narrowed down to only the given
// categories.
export function filterLeaguesByCategories(
  leagues: League[],
  categories: string[],
): League[] {
  return leagues.map((league) => ({
    ...league,
    itemEntries: league.itemEntries.filter((entry) =>
      categories.includes(entry.item.category),
    ),
  }));
}

// Every currency an item can be traded against (a "pair"), e.g. "divine",
// "exalted", "chaos", across every league. Drives the pair currency filter
// toggles.
export const ALL_PAIR_CURRENCIES: string[] = [
  ...new Set(
    LEAGUES.flatMap((league) =>
      league.itemEntries.flatMap((entry) =>
        entry.pairs.map((pair) => pair.id),
      ),
    ),
  ),
].sort();

// Leagues with each item's pairs narrowed down to only the given currencies
// — an item with none of its pairs selected effectively drops out, since
// there's nothing left to rank or chart it by.
export function filterLeaguesByPairCurrencies(
  leagues: League[],
  pairCurrencies: string[],
): League[] {
  return leagues.map((league) => ({
    ...league,
    itemEntries: league.itemEntries.map((entry) => ({
      ...entry,
      pairs: entry.pairs.filter((pair) => pairCurrencies.includes(pair.id)),
    })),
  }));
}

export function getLeagueById(leagueId: string): League {
  return LEAGUES.find((league) => league.id === leagueId) ?? LEAGUES[0];
}

// Always today, truncated to UTC midnight to match the daily granularity of
// the history data — recomputed on every load instead of a hardcoded date
// that'd otherwise need updating by hand as real time moves on.
function getTodayAtUtcMidnight(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export const DEFAULT_CURRENT_DATE = getTodayAtUtcMidnight();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getDayOfLeagueForDate(
  date: string,
  leagueStartDate: string,
): number {
  return (
    Math.round(
      (new Date(date).getTime() - new Date(leagueStartDate).getTime()) /
        MS_PER_DAY,
    ) + 1
  );
}

// The active league's real start date lives in current-league.json, not in
// the sample datasets under LEAGUES — each of those has its own history
// window that isn't tied to any particular real-world start date.
export const DEFAULT_DAY_OF_LEAGUE = getDayOfLeagueForDate(
  DEFAULT_CURRENT_DATE,
  currentLeague.startDate,
);

// The slider always spans from the start of the league to
// SLIDER_DAYS_RANGE days after it. A league's day 1 is always day 1
// regardless of its start date, so these bounds don't depend on it.
export const SLIDER_DAYS_RANGE = 50;
export const MIN_DAY_OF_LEAGUE = 1;
export const MAX_DAY_OF_LEAGUE = MIN_DAY_OF_LEAGUE + SLIDER_DAYS_RANGE;

export const DAYS_BEFORE_CURRENT_DAY = 2;
export const DAYS_AFTER_CURRENT_DAY = 2;

// Bounds and defaults for the user-controlled "days back"/"days forward"
// sliders that drive the single Best Investment panel.
export const MIN_WINDOW_DAYS = 0;
export const DEFAULT_DAYS_BACK = 2;
export const DEFAULT_DAYS_FORWARD = 3;

// Bounds and default for the user-controlled slider that decides how many
// Best Investment cards are shown.
export const MIN_BEST_INVESTMENT_COUNT = 3;
export const MAX_BEST_INVESTMENT_COUNT = 18;
export const DEFAULT_BEST_INVESTMENT_COUNT = 9;

// Bounds and default for the user-controlled slider that hides items with
// too little trade volume on the active day to trust.
export const MIN_VOLUME_FILTER = 0;
export const MAX_VOLUME_FILTER = 5000;
export const DEFAULT_MIN_VOLUME = 100;

const IMAGE_BASE_URL = "https://web.poecdn.com";

const coreItemsByIdCache = new WeakMap<ItemEntry[], Map<string, MarketItem>>();

function getCoreItemsById(itemEntries: ItemEntry[]): Map<string, MarketItem> {
  let coreItemsById = coreItemsByIdCache.get(itemEntries);
  if (!coreItemsById) {
    coreItemsById = new Map<string, MarketItem>();
    for (const entry of itemEntries) {
      for (const coreItem of entry.core.items) {
        coreItemsById.set(coreItem.id, coreItem);
      }
    }
    coreItemsByIdCache.set(itemEntries, coreItemsById);
  }
  return coreItemsById;
}

// Looks a pair's display name up across every given league, using whichever
// one has it first.
export function getPairDisplayName(pairId: string, leagues: League[]): string {
  for (const league of leagues) {
    const name = getCoreItemsById(league.itemEntries).get(pairId)?.name;
    if (name) return name;
  }
  return pairId;
}

export function getItemImageUrl(item: MarketItem): string {
  return `${IMAGE_BASE_URL}${item.image}`;
}

const POE_NINJA_LEAGUE_SLUG = String(
  import.meta.env.CURRENT_LEAGUE ?? LEAGUES[0].name,
)
  .replace(/\s+/g, "")
  .toLowerCase();

// poe.ninja's own URL slug for a category isn't always just its lowercased
// name (e.g. our "Lineage Gems" is their "lineage-support-gems") — add an
// entry here for any category that doesn't follow the simple pattern.
const POE_NINJA_CATEGORY_SLUGS: Record<string, string> = {
  "Lineage Gems": "lineage-support-gems",
};

// The poe.ninja economy page for an item, always under the current league
// (from the CURRENT_LEAGUE env var) regardless of which league's card this
// item came from.
export function getPoeNinjaUrl(item: MarketItem): string {
  const categorySlug =
    POE_NINJA_CATEGORY_SLUGS[item.category] ??
    item.category.toLowerCase().replace(/\s+/g, "-");
  return `https://poe.ninja/poe2/economy/${POE_NINJA_LEAGUE_SLUG}/${categorySlug}/${item.detailsId}`;
}

export function getPairImageUrl(
  pairId: string,
  leagues: League[],
): string | undefined {
  for (const league of leagues) {
    const coreItem = getCoreItemsById(league.itemEntries).get(pairId);
    if (coreItem) return getItemImageUrl(coreItem);
  }
  return undefined;
}

export interface HistoryRow {
  entry: HistoryEntry;
  percentChange: number | null;
  isCurrentDay: boolean;
  dayOfLeague: number;
}

// history is sorted newest-first; this returns every entry oldest-first,
// with each entry's day-over-day percent change, its day of the league, and
// whether it's currentDayOfLeague.
//
// dayOfLeague is measured in real elapsed days from this pair's own oldest
// history entry, not by array position — a pair that's rarely traded can
// have real gaps of several days between snapshots (poe.ninja only logs a
// point when a trade happens), and treating those as consecutive days would
// both understate the gap and wildly overstate the day-over-day change.
export function getAllHistoryRows(
  history: HistoryEntry[],
  currentDayOfLeague: number,
): HistoryRow[] {
  const oldestTimestamp = history[history.length - 1]?.timestamp;
  return [...history].reverse().map((entry, index) => {
    const originalIndex = history.length - 1 - index;
    const previousEntry = history[originalIndex + 1];
    const percentChange = previousEntry
      ? ((entry.rate - previousEntry.rate) / previousEntry.rate) * 100
      : null;
    const dayOfLeague = oldestTimestamp
      ? Math.round(
          (new Date(entry.timestamp).getTime() -
            new Date(oldestTimestamp).getTime()) /
            MS_PER_DAY,
        ) + 1
      : index + 1;
    return {
      entry,
      percentChange,
      isCurrentDay: dayOfLeague === currentDayOfLeague,
      dayOfLeague,
    };
  });
}

// Narrows a full, oldest-first row list down to daysBefore days before and
// daysAfter days after currentDayOfLeague, matched by each row's day of the
// league rather than its array position.
export function getHistoryRowsInWindow(
  rows: HistoryRow[],
  daysBefore: number,
  daysAfter: number,
  currentDayOfLeague: number,
): HistoryRow[] {
  const startDay = currentDayOfLeague - daysBefore;
  const endDay = currentDayOfLeague + daysAfter;
  return rows.filter(
    (row) => row.dayOfLeague >= startDay && row.dayOfLeague <= endDay,
  );
}

// Narrows a full, oldest-first row list down to DAYS_BEFORE_CURRENT_DAY days
// before and DAYS_AFTER_CURRENT_DAY days after currentDayOfLeague.
export function getHistoryRowsAroundCurrentDay(
  rows: HistoryRow[],
  currentDayOfLeague: number,
): HistoryRow[] {
  return getHistoryRowsInWindow(
    rows,
    DAYS_BEFORE_CURRENT_DAY,
    DAYS_AFTER_CURRENT_DAY,
    currentDayOfLeague,
  );
}

// The percent change of a pair's rate from currentDayOfLeague to the day
// after it, or null if that day isn't in the history (e.g. an illiquid
// pair with no trade that day).
export function getNextDayPercentChange(
  history: HistoryEntry[],
  currentDayOfLeague: number,
): number | null {
  const nextDayRow = getAllHistoryRows(history, currentDayOfLeague).find(
    (row) => row.dayOfLeague === currentDayOfLeague + 1,
  );
  return nextDayRow ? nextDayRow.percentChange : null;
}

// The percent change of a pair's rate from daysBack days before
// currentDayOfLeague to daysForward days after it. If there's no data that
// far back (e.g. on the first days of the league), falls back to using
// currentDayOfLeague itself as the start, so the change is still based on
// the future data available. Returns null only if even that isn't in the
// history.
export function getWindowPercentChange(
  history: HistoryEntry[],
  currentDayOfLeague: number,
  daysBack: number,
  daysForward: number,
): number | null {
  const rows = getAllHistoryRows(history, currentDayOfLeague);
  const beforeRow = rows.find(
    (row) => row.dayOfLeague === currentDayOfLeague - daysBack,
  );
  const currentRow = rows.find((row) => row.dayOfLeague === currentDayOfLeague);
  const startRow = beforeRow ?? currentRow;
  const endRow = rows.find(
    (row) => row.dayOfLeague === currentDayOfLeague + daysForward,
  );
  if (!startRow || !endRow) return null;
  return (
    ((endRow.entry.rate - startRow.entry.rate) / startRow.entry.rate) * 100
  );
}

// A pair's trade volume on exactly currentDayOfLeague, or null if it has no
// entry for that day (e.g. an illiquid pair with no trade that day).
export function getVolumeForDay(
  history: HistoryEntry[],
  currentDayOfLeague: number,
): number | null {
  const row = getAllHistoryRows(history, currentDayOfLeague).find(
    (row) => row.dayOfLeague === currentDayOfLeague,
  );
  return row ? row.entry.volumePrimaryValue : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface LeagueHistory {
  league: League;
  history: HistoryEntry[];
}

// Every league (from those given) that carries this exact item+pair, paired
// with that pair's history in that league.
export function getLeagueHistoriesForPair(
  leagues: League[],
  itemId: string,
  pairId: string,
): LeagueHistory[] {
  const results: LeagueHistory[] = [];
  for (const league of leagues) {
    const entry = league.itemEntries.find((e) => e.item.id === itemId);
    const pair = entry?.pairs.find((p) => p.id === pairId);
    if (pair) results.push({ league, history: pair.history });
  }
  return results;
}

// The average of getPercentChange across every league that has this
// item+pair, ignoring leagues that don't have it or have no data for the
// relevant days. Null if none of them do.
export function getAveragePercentChangeForPair(
  leagues: League[],
  itemId: string,
  pairId: string,
  currentDayOfLeague: number,
  getPercentChange: (
    history: HistoryEntry[],
    currentDayOfLeague: number,
  ) => number | null,
): number | null {
  const leagueHistories = getLeagueHistoriesForPair(leagues, itemId, pairId);
  const changes: number[] = [];
  for (const { history } of leagueHistories) {
    const change = getPercentChange(history, currentDayOfLeague);
    if (change !== null) changes.push(change);
  }
  return average(changes);
}

export interface MergedItemEntry {
  item: MarketItem;
  pairIds: string[];
}

// Every item across the given leagues, deduplicated by item id, with the
// union of pair ids any of those leagues has for it.
export function getMergedItemEntries(leagues: League[]): MergedItemEntry[] {
  const byItemId = new Map<string, MergedItemEntry>();
  for (const league of leagues) {
    for (const { item, pairs } of league.itemEntries) {
      let merged = byItemId.get(item.id);
      if (!merged) {
        merged = { item, pairIds: [] };
        byItemId.set(item.id, merged);
      }
      for (const pair of pairs) {
        if (!merged.pairIds.includes(pair.id)) merged.pairIds.push(pair.id);
      }
    }
  }
  return [...byItemId.values()];
}

// The best (highest) average next-day percent change among a set of pair
// ids for one item, or -Infinity if none of them have next-day data.
export function getBestAveragePercentChangeForItem(
  leagues: League[],
  itemId: string,
  pairIds: string[],
  currentDayOfLeague: number,
): number {
  return pairIds.reduce((best, pairId) => {
    const change = getAveragePercentChangeForPair(
      leagues,
      itemId,
      pairId,
      currentDayOfLeague,
      getNextDayPercentChange,
    );
    return change !== null && change > best ? change : best;
  }, Number.NEGATIVE_INFINITY);
}

// Merged items sorted by their best pair's average next-day percent change,
// best investment first.
export function getMergedItemEntriesSortedByBestInvestment(
  leagues: League[],
  currentDayOfLeague: number,
): MergedItemEntry[] {
  return getMergedItemEntries(leagues).sort(
    (a, b) =>
      getBestAveragePercentChangeForItem(
        leagues,
        b.item.id,
        b.pairIds,
        currentDayOfLeague,
      ) -
      getBestAveragePercentChangeForItem(
        leagues,
        a.item.id,
        a.pairIds,
        currentDayOfLeague,
      ),
  );
}

// A single item's pair ids sorted by their own average next-day percent
// change, best investment first.
export function getSortedPairIdsByAverageChange(
  leagues: League[],
  itemId: string,
  pairIds: string[],
  currentDayOfLeague: number,
): string[] {
  return [...pairIds].sort((a, b) => {
    const changeA =
      getAveragePercentChangeForPair(
        leagues,
        itemId,
        a,
        currentDayOfLeague,
        getNextDayPercentChange,
      ) ?? Number.NEGATIVE_INFINITY;
    const changeB =
      getAveragePercentChangeForPair(
        leagues,
        itemId,
        b,
        currentDayOfLeague,
        getNextDayPercentChange,
      ) ?? Number.NEGATIVE_INFINITY;
    return changeB - changeA;
  });
}

export interface BestInvestment {
  item: MarketItem;
  pairId: string;
  percentChange: number;
  leagueHistories: LeagueHistory[];
}

// Across every item+pair found in any of the given leagues, ranks by the
// average of getPercentChange across the leagues that have it. Only actual
// gains are included; losses are never "a best investment". Each item
// appears at most once, represented by its best-performing pair.
function getBestInvestmentsBy(
  leagues: League[],
  getPercentChange: (
    history: HistoryEntry[],
    currentDayOfLeague: number,
  ) => number | null,
  count: number,
  currentDayOfLeague: number,
  minVolume: number,
): BestInvestment[] {
  const bestByItemId = new Map<string, BestInvestment>();

  for (const { item, pairIds } of getMergedItemEntries(leagues)) {
    for (const pairId of pairIds) {
      const leagueHistories = getLeagueHistoriesForPair(
        leagues,
        item.id,
        pairId,
      );
      const volumes = leagueHistories
        .map(({ history }) => getVolumeForDay(history, currentDayOfLeague))
        .filter((volume): volume is number => volume !== null);
      const volume = average(volumes);
      if (volume === null || volume < minVolume) continue;

      const changes = leagueHistories
        .map(({ history }) => getPercentChange(history, currentDayOfLeague))
        .filter((change): change is number => change !== null);
      const percentChange = average(changes);
      if (percentChange === null || percentChange <= 0) continue;

      const existing = bestByItemId.get(item.id);
      if (!existing || percentChange > existing.percentChange) {
        bestByItemId.set(item.id, {
          item,
          pairId,
          percentChange,
          leagueHistories,
        });
      }
    }
  }

  return [...bestByItemId.values()]
    .sort((a, b) => b.percentChange - a.percentChange)
    .slice(0, count);
}

// The best things to hold on currentDayOfLeague, based on the rate change
// from daysBack days before it to daysForward days after it, averaged
// across the given leagues.
export function getBestInvestmentsForWindow(
  leagues: League[],
  count: number,
  currentDayOfLeague: number,
  daysBack: number,
  daysForward: number,
  minVolume: number,
): BestInvestment[] {
  return getBestInvestmentsBy(
    leagues,
    (history, day) =>
      getWindowPercentChange(history, day, daysBack, daysForward),
    count,
    currentDayOfLeague,
    minVolume,
  );
}
