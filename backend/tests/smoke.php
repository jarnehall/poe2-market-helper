<?php

declare(strict_types=1);

// Dependency-free smoke tests for the ported ranking/date-math logic in
// Domain\MarketData — no PHPUnit/Composer. Run with:
//   <php-bin> backend/tests/smoke.php
// Exits non-zero (and prints to STDERR) on the first failing check.

require_once __DIR__ . '/../src/Domain/MarketData.php';

use App\Domain\MarketData;

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

function closeTo(?float $actual, ?float $expected, float $tolerance = 0.01): bool
{
    if ($actual === null || $expected === null) {
        return $actual === $expected;
    }

    return abs($actual - $expected) < $tolerance;
}

// --- getAllHistoryRows: day-of-league rounding + day-over-day percent change ---

$leagueStart = '2026-01-01T00:00:00Z';

$history = [
    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 110.0, 'volumePrimaryValue' => 100],
    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 100.0, 'volumePrimaryValue' => 100],
    ['timestamp' => '2026-01-01T00:00:00Z', 'rate' => 90.0, 'volumePrimaryValue' => 100],
];

$rows = MarketData::getAllHistoryRows($history, startDate: $leagueStart, currentDayOfLeague: 3);
$byDay = [];
foreach ($rows as $row) {
    $byDay[$row['dayOfLeague']] = $row;
}

check(count($rows) === 3, 'getAllHistoryRows returns one row per history entry');
check(isset($byDay[1], $byDay[3], $byDay[5]), 'day-of-league is computed from elapsed days vs. the league startDate (1, 3, 5 — not 1, 2, 3)');
check($byDay[1]['percentChange'] === null, 'the oldest row has no previous entry, so percentChange is null');
check(closeTo($byDay[3]['percentChange'], 11.111), 'day 3 percent change vs. day 1 (100 vs 90) is ~11.11%');
check(closeTo($byDay[5]['percentChange'], 10.0), 'day 5 percent change vs. day 3 (110 vs 100) is 10%');
check($byDay[3]['isCurrentDay'] === true && $byDay[1]['isCurrentDay'] === false, 'isCurrentDay only true for the requested day');

// --- getAllHistoryRows: dayOfLeague is anchored to the league's startDate, ---
// --- NEVER to this pair's own oldest entry (the actual bug being fixed)   ---

$lateHistory = [
    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 50.0, 'volumePrimaryValue' => 100],
    ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 40.0, 'volumePrimaryValue' => 100],
];
// This pair's own oldest entry is Jan 2 — a day after the league (Jan 1)
// actually started, e.g. because nobody traded it yet on day 1.
$lateRows = MarketData::getAllHistoryRows($lateHistory, startDate: $leagueStart, currentDayOfLeague: 3);
$lateByDay = [];
foreach ($lateRows as $row) {
    $lateByDay[$row['dayOfLeague']] = $row;
}

check(
    !isset($lateByDay[1]) && isset($lateByDay[2], $lateByDay[5]),
    'a pair with no trades yet on the league\'s real day 1 has no day-1 row at all, and its real entries land on day 2 and day 5 — not day 1 and day 4, which anchoring to its own oldest entry would (wrongly) give',
);

// --- getAllHistoryRows: a startDate with a real (non-midnight) launch time ---
// --- treats the NEXT midnight as day 1, not its own calendar day          ---

// A league that launched at 19:00Z on Jan 1 — no trading (so no history
// snapshot) can exist before that moment, so the first midnight snapshot
// that can possibly reflect real data is Jan 2 00:00, not Jan 1's own
// midnight (which is *before* the league even started).
$realLaunchTimeStart = '2026-01-01T19:00:00Z';
$lateLaunchHistory = [
    ['timestamp' => '2026-01-04T00:00:00Z', 'rate' => 130.0, 'volumePrimaryValue' => 100],
    ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 100.0, 'volumePrimaryValue' => 100],
];
$lateLaunchRows = MarketData::getAllHistoryRows($lateLaunchHistory, startDate: $realLaunchTimeStart, currentDayOfLeague: 1);
$lateLaunchByDay = [];
foreach ($lateLaunchRows as $row) {
    $lateLaunchByDay[$row['dayOfLeague']] = $row;
}
check(
    isset($lateLaunchByDay[1], $lateLaunchByDay[3]),
    'a startDate with a non-midnight launch time (19:00Z on Jan 1) gives day 1 to the Jan 2 00:00 entry (the first midnight after launch) and day 3 to Jan 4 — not day 0/2, which comparing against Jan 1\'s own midnight would (wrongly) give',
);

// --- getWindowPercentChange: window always starts exactly at currentDayOfLeague ---
// --- (days before it are a chart-visualization concern only — see           ---
// --- getHistoryRowsInWindow — and never factor into this calculation at all) ---

$forwardChange = MarketData::getWindowPercentChange($history, startDate: $leagueStart, currentDayOfLeague: 3, daysForward: 2);
check(closeTo($forwardChange, 10.0), 'window change day3->day5 (100 to 110) is 10%');

$noStartData = MarketData::getWindowPercentChange($history, startDate: $leagueStart, currentDayOfLeague: 2, daysForward: 3);
// Day 2 doesn't exist in $history (only 1, 3, 5 do) — there's no fallback to
// a nearby day (e.g. day 1) the way the old daysBack-based start used to
// fall back; a missing start day is simply null.
check($noStartData === null, 'returns null (no fallback to a nearby day) when currentDayOfLeague itself has no data');

$noEndData = MarketData::getWindowPercentChange($history, startDate: $leagueStart, currentDayOfLeague: 3, daysForward: 100);
check($noEndData === null, 'returns null when the window end day has no data at all');

// --- getBestInvestmentsForWindow: keeps only the best-performing pair per item ---

$league = [
    'id' => 'test-league',
    'name' => 'Test League',
    'color' => '#000000',
    'startDate' => $leagueStart,
    'itemEntries' => [[
        'item' => ['id' => 'chaos', 'name' => 'Chaos Orb', 'image' => '/chaos.png', 'category' => 'Currency', 'detailsId' => 'chaos-orb'],
        'pairs' => [
            [
                'id' => 'divine',
                'rate' => 40.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    // day 5 (the window end, currentDayOfLeague + daysForward below).
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 40.0, 'volumePrimaryValue' => 100],
                    // day 3 (currentDayOfLeague itself — the window start).
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                    // day 1: before currentDayOfLeague, so this rate must be
                    // completely ignored by the window calculation — only
                    // here to guard against a regression of the old
                    // daysBack-picks-the-start bug (if it were wrongly used,
                    // 5 -> 40 would give +700%, not +100%).
                    ['timestamp' => '2026-01-01T00:00:00Z', 'rate' => 5.0, 'volumePrimaryValue' => 100],
                ],
            ],
            [
                'id' => 'exalted',
                'rate' => 14.4,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 14.4, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 12.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-01T00:00:00Z', 'rate' => 3.0, 'volumePrimaryValue' => 100],
                ],
            ],
        ],
        'core' => [
            'items' => [
                ['id' => 'divine', 'name' => 'Divine Orb', 'image' => '/divine.png', 'category' => 'Currency', 'detailsId' => 'divine-orb'],
                ['id' => 'exalted', 'name' => 'Exalted Orb', 'image' => '/exalted.png', 'category' => 'Currency', 'detailsId' => 'exalted-orb'],
            ],
            'rates' => [],
            'primary' => 'divine',
            'secondary' => 'exalted',
        ],
    ]],
];

$best = MarketData::getBestInvestmentsForWindow(
    [$league],
    count: 10,
    currentDayOfLeague: 3,
    daysForward: 2,
    minVolume: 0,
);

check(count($best) === 1, 'one item with two candidate pairs yields exactly one ranked investment');
check(($best[0]['item']['id'] ?? null) === 'chaos', 'the ranked investment is for the right item');
check(($best[0]['pairId'] ?? null) === 'divine', 'the higher-performing pair (divine, +100%) is kept over the lower one (exalted, +20%)');
check(closeTo($best[0]['percentChange'] ?? null, 100.0), 'the kept pair\'s percent change is the divine pair\'s own window change (day3->day5, ignoring day1)');

check(MarketData::getPairDisplayName('exalted', [$league]) === 'Exalted Orb', 'getPairDisplayName resolves a pair id via core.items');
check(MarketData::getPairImage('exalted', [$league]) === '/exalted.png', 'getPairImage resolves a pair id via core.items');
check(MarketData::getPairDisplayName('unknown-pair', [$league]) === 'unknown-pair', 'getPairDisplayName falls back to the raw id when not found');

// --- getAllPairsForItem: every pair an item has data for, not just the ranked winner ---

$allPairs = MarketData::getAllPairsForItem([$league], 'chaos', currentDayOfLeague: 3, daysForward: 2);
$allPairIds = array_map(fn(array $pair): string => $pair['pairId'], $allPairs);
$allPairsById = [];
foreach ($allPairs as $pair) {
    $allPairsById[$pair['pairId']] = $pair;
}

check(count($allPairs) === 2, 'getAllPairsForItem returns both of chaos\'s pairs, not just the ranked winner (divine)');
check(in_array('divine', $allPairIds, true) && in_array('exalted', $allPairIds, true), 'both divine and exalted are present');
check(closeTo($allPairsById['divine']['percentChange'] ?? null, 100.0), 'each pair carries its own windowed percent change (divine, +100%) — not just the ranked winner\'s');
check(closeTo($allPairsById['exalted']['percentChange'] ?? null, 20.0), 'exalted keeps its own (lower, non-winning) percent change too, unlike getBestInvestmentsForWindow which would discard it');
check(MarketData::getAllPairsForItem([$league], 'unknown-item', currentDayOfLeague: 3, daysForward: 2) === [], 'an item with no entry in any league yields no pairs at all');

// --- getInvestmentsForPins: favorites/pins bypass ranking, unlike getBestInvestmentsForWindow ---

$otherLeague = [
    'id' => 'other-league',
    'name' => 'Other League',
    'color' => '#111111',
    'startDate' => $leagueStart,
    'itemEntries' => [], // doesn't carry the "chaos" item at all
];

$pins = [
    ['category' => 'Currency', 'itemId' => 'chaos', 'pairId' => 'divine'],
    ['category' => 'Currency', 'itemId' => 'chaos', 'pairId' => 'exalted'],
    ['category' => 'Currency', 'itemId' => 'unknown-item', 'pairId' => 'divine'],
];

$pinned = MarketData::getInvestmentsForPins(
    [$league, $otherLeague],
    $pins,
    currentDayOfLeague: 3,
    daysForward: 2,
);

check(count($pinned) === 2, 'a pin for an item missing from every league is skipped entirely (2 of 3 pins resolve)');

$divinePin = null;
$exaltedPin = null;
foreach ($pinned as $entry) {
    if ($entry['pairId'] === 'divine') $divinePin = $entry;
    if ($entry['pairId'] === 'exalted') $exaltedPin = $entry;
}

check($divinePin !== null && $exaltedPin !== null, 'both real pins resolve independently, each keeping its own pairId (no best-pair-per-item collapsing)');
check(closeTo($divinePin['percentChange'] ?? null, 100.0), 'the divine pin gets its own window percent change (+100%), unaffected by minVolume/gain-only rules');
check(closeTo($exaltedPin['percentChange'] ?? null, 20.0), 'the exalted pin (only +20%) is still included, not dropped for being the "worse" pair');
check(
    count($divinePin['leagueHistories']) === 1,
    'a league with no entry for the pinned item (other-league) contributes no leagueHistories row for it',
);

$noWindowData = MarketData::getInvestmentsForPins(
    [$league],
    [['category' => 'Currency', 'itemId' => 'chaos', 'pairId' => 'divine']],
    currentDayOfLeague: 3,
    daysForward: 100,
);
check(
    count($noWindowData) === 1 && $noWindowData[0]['percentChange'] === null,
    'a pin with no data at all in the requested window is still included, with a null percentChange, rather than dropped like getBestInvestmentsForWindow would',
);

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} check(s) failed.\n");
    exit(1);
}

echo "\nAll checks passed.\n";
