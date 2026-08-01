#!/usr/bin/env node
// One-time (but reusable) snapshot importer: fetches every item in a given
// poe.ninja economy category for a *completed* league and writes them out as
// data/<game>/<league>/<category>.json, in the exact shape
// backend/src/DataAccess/LeagueRepository.php already expects from the
// static POE2 files (one {item, pairs, core} entry per item, `pairs[].history`
// with real dated rate history) — poe.ninja's own `details` endpoint returns
// that shape directly, no reshaping needed.
//
// Usage: node scripts/import-poe-ninja-snapshot.mjs <poe1|poe2> <leagueFolder> <leagueName> <category>
//   node scripts/import-poe-ninja-snapshot.mjs poe1 mirage Mirage Currency
// <leagueFolder> is the on-disk slug (data/<game>/<leagueFolder>/..., matches
// leagues.php's 'folder'/'id'); <leagueName> is poe.ninja's own league query
// value (its real display name, e.g. "Mirage" or "Fate of the Vaal" — poe.ninja
// rejects a lowercase/slugified league name with an empty item list rather
// than an error, so this must be exact).
//
// Only the `overview` endpoint is used to enumerate which item ids exist in
// the category; the real per-item data comes from `details`, one request
// per item, capped at CONCURRENCY at a time so this doesn't hammer poe.ninja.
// Mirrors backend/config/poe-ninja.php's per-game URL/type-override config —
// keep the two in sync if either changes.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USER_AGENT = "poe2-market-guide/1.0 (personal project; +https://poe2.jarnehall.se/)";
const CONCURRENCY = 6;

const GAME_CONFIG = {
  poe2: {
    baseUrl: "https://poe.ninja/poe2/api/economy/exchange/current",
    typeByCategory: { "Lineage Gems": "LineageSupportGems", Omens: "Ritual" },
  },
  poe1: {
    baseUrl: "https://poe.ninja/poe1/api/economy/exchange/current",
    typeByCategory: {},
  },
};

function categoryToFilename(category) {
  return category.toLowerCase().replace(/ /g, "-") + ".json";
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchWithPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { ok: true, value: await worker(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runOne));
  return results;
}

async function main() {
  const [game, leagueFolder, leagueName, category] = process.argv.slice(2);
  if (!game || !leagueFolder || !leagueName || !category || !GAME_CONFIG[game]) {
    console.error(
      "Usage: node scripts/import-poe-ninja-snapshot.mjs <poe1|poe2> <leagueFolder> <leagueName> <category>",
    );
    process.exit(1);
  }

  const { baseUrl, typeByCategory } = GAME_CONFIG[game];
  const type = typeByCategory[category] ?? category;

  console.log(`Fetching item list: ${category} in ${leagueName} (${game})...`);
  const overview = await fetchJson(
    `${baseUrl}/overview?${new URLSearchParams({ league: leagueName, type })}`,
  );
  const itemIds = overview.items.map((item) => item.id);
  console.log(`Found ${itemIds.length} items. Fetching details (concurrency ${CONCURRENCY})...`);

  const results = await fetchWithPool(
    itemIds,
    (itemId) => fetchJson(`${baseUrl}/details?${new URLSearchParams({ league: leagueName, type, id: itemId })}`),
    CONCURRENCY,
  );

  const entries = [];
  const failed = [];
  results.forEach((result, index) => {
    if (result.ok) {
      entries.push(result.value);
    } else {
      failed.push({ itemId: itemIds[index], error: String(result.error) });
    }
  });

  if (failed.length > 0) {
    console.warn(`\n${failed.length} item(s) failed and were skipped:`);
    for (const { itemId, error } of failed) {
      console.warn(`  ${itemId}: ${error}`);
    }
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(repoRoot, "data", game, leagueFolder);
  const outFile = path.join(outDir, categoryToFilename(category));

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(entries, null, 2) + "\n");

  console.log(`\nWrote ${entries.length} entries to ${path.relative(repoRoot, outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
