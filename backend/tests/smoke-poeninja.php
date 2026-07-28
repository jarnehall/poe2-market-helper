<?php

declare(strict_types=1);

// Dependency-free smoke tests for DataAccess\PoeNinjaClient's caching
// behavior. Run with:
//   <php-bin> -c backend/php.ini backend/tests/smoke-poeninja.php
// The first two checks are network-free (they only exercise the cache
// read/hit path); the last one makes one real request to poe.ninja to
// confirm the actual integration still works end-to-end.

require_once __DIR__ . '/../src/DataAccess/PoeNinjaClient.php';

use App\DataAccess\PoeNinjaClient;

$failures = 0;

function check(bool $condition, string $label): void
{
    global $failures;
    if ($condition) {
        echo "PASS: {$label}\n";
    } else {
        fwrite(STDERR, "FAIL: {$label}\n");
        $failures++;
    }
}

$cacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-cache-' . uniqid() . '.json';

// --- A fresh (today-dated) cached entry is returned as-is, with no fetch ---
// (a nonsense item id + league name would almost certainly fail or return
// something different if this actually hit the network).

$today = gmdate('Y-m-d');
// Round-tripped through json_encode/decode up front, same as the cache file
// itself does — otherwise e.g. a literal 1.0 here vs. the 1 that comes back
// out of json_decode() would make the strict === comparisons below fail on
// a type mismatch that has nothing to do with the caching logic being tested.
$fakeEntry = json_decode(json_encode([
    'item' => ['id' => 'not-a-real-item', 'name' => 'Not A Real Item', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'not-a-real-item'],
    'pairs' => [['id' => 'chaos', 'rate' => 1.5, 'volumePrimaryValue' => 1, 'history' => []]],
    'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'chaos'],
]), true);

file_put_contents($cacheFile, json_encode([
    'not-a-real-item' => ['fetchedDate' => $today, 'entry' => $fakeEntry],
    'known-empty-item' => ['fetchedDate' => $today, 'entry' => null],
]));

$client = new PoeNinjaClient('Definitely Not A Real League', $cacheFile);

$result = $client->getEntries([
    ['itemId' => 'not-a-real-item', 'category' => 'Currency'],
    ['itemId' => 'known-empty-item', 'category' => 'Currency'],
]);

check($result['not-a-real-item'] === $fakeEntry, 'a same-day cached entry is returned verbatim, without refetching');
check(array_key_exists('known-empty-item', $result) && $result['known-empty-item'] === null, 'a same-day cached "no data" (null) result is also honored without refetching');
check($client->getLastAttemptedCount() === 0, 'a fully cache-hit call attempted zero fresh fetches');
check($client->getLastFailedItemIds() === [], 'a fully cache-hit call reports no failed items');

@unlink($cacheFile);

// --- A genuine fetch failure (bogus league/item that 404s) is reported ---
// --- via getLastFailedItemIds(), distinct from a confirmed "no data" ---

$failureCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-cache-failure-' . uniqid() . '.json';
$failureClient = new PoeNinjaClient('Definitely Not A Real League', $failureCacheFile);
$failureResult = $failureClient->getEntries([['itemId' => 'not-a-real-item-either', 'category' => 'Currency']]);

check($failureResult['not-a-real-item-either'] === null, 'an item poe.ninja 404s on comes back null in the main result, same as a confirmed "no data"');
check($failureClient->getLastAttemptedCount() === 1, 'the failing item counted as one attempted fetch (network required)');
check($failureClient->getLastFailedItemIds() === ['not-a-real-item-either'], 'the failing item is reported via getLastFailedItemIds(), unlike a real "no data" response');

@unlink($failureCacheFile);

// --- Real integration check: one live call against the actual current league ---
// (Note: poe.ninja has no "details" drill-down for the core reference
// currencies themselves — chaos/divine/exalted all 404 — so this
// deliberately uses a regular tradeable item instead.)

$currentLeagueInfo = json_decode(file_get_contents(__DIR__ . '/../../data/current-league.json'), true);
$realCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-cache-real-' . uniqid() . '.json';
$realClient = new PoeNinjaClient($currentLeagueInfo['name'], $realCacheFile);

$realResult = $realClient->getEntries([['itemId' => 'hinekoras-lock', 'category' => 'Currency']]);
$realEntry = $realResult['hinekoras-lock'] ?? null;

check($realEntry !== null, 'a real fetch for a regular item in the current league returns data (network required)');
check(
    $realEntry !== null && ($realEntry['item']['id'] ?? null) === 'hinekoras-lock' && $realEntry['pairs'] !== [],
    'the fetched entry has the expected item id and at least one pair',
);
check($realClient->getLastFailedItemIds() === [], 'a real successful fetch reports zero failed items');

// Second call should now be served from the cache this run just wrote —
// same result, but exercising the round-trip write-then-read path.
$cachedResult = $realClient->getEntries([['itemId' => 'hinekoras-lock', 'category' => 'Currency']]);
check($cachedResult['hinekoras-lock'] === $realEntry, 'a second call the same day returns the exact same (now cached) entry');
check($realClient->getLastAttemptedCount() === 0, 'the second (now-cached) call attempted zero fresh fetches');

@unlink($realCacheFile);

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} check(s) failed.\n");
    exit(1);
}

echo "\nAll checks passed.\n";
