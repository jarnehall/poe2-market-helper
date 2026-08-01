<?php

declare(strict_types=1);

// Dependency-free smoke tests for the ported ranking/date-math logic in
// Domain\MarketData — no PHPUnit/Composer. Run with:
//   <php-bin> -c backend/php.ini backend/tests/smoke.php
// -c backend/php.ini (curl) is needed for the resolveRankedInvestments
// backfill tests near the end, which deliberately let PoeNinjaClient
// attempt (and fail fast against) an '.invalid' host for a couple of
// items — everything else here is pure fixture data with no real request.
// Exits non-zero (and prints to STDERR) on the first failing check.

require_once __DIR__ . '/../src/Domain/MarketData.php';
require_once __DIR__ . '/../src/DataAccess/LeagueRepository.php';
require_once __DIR__ . '/../src/DataAccess/PoeNinjaClient.php';
require_once __DIR__ . '/../src/Api/InvestmentPayloadBuilder.php';

use App\Api\InvestmentPayloadBuilder;
use App\DataAccess\LeagueRepository;
use App\DataAccess\PoeNinjaClient;
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

// --- getBestInvestmentsForWindow: $useAveragePairs averages every ---
// --- qualifying pair's change instead of keeping only the best one ---

$averaged = MarketData::getBestInvestmentsForWindow(
    [$league],
    count: 10,
    currentDayOfLeague: 3,
    daysForward: 2,
    minVolume: 0,
    useAveragePairs: true,
);

check(count($averaged) === 1, 'useAveragePairs still yields exactly one investment for the item');
check(
    ($averaged[0]['pairId'] ?? null) === 'divine',
    'useAveragePairs still shows the best-performing pair (divine) for the chart/versus display',
);
check(
    closeTo($averaged[0]['percentChange'] ?? null, 60.0),
    'useAveragePairs reports the average of both qualifying pairs (100% and 20% -> 60%), not just divine\'s own 100%',
);

// A losing pair is never itself "a best investment" candidate (see the
// $percentChange <= 0 continue above) — useAveragePairs must not fold it
// into the average either, on a fixture isolated from $league above so it
// doesn't disturb getAllPairsForItem's "exactly 2 pairs" assertion.
$mixedSignLeague = [
    'id' => 'test-league',
    'name' => 'Test League',
    'color' => '#000000',
    'startDate' => $leagueStart,
    'itemEntries' => [[
        'item' => ['id' => 'mixed', 'name' => 'Mixed Item', 'image' => '/mixed.png', 'category' => 'Currency', 'detailsId' => 'mixed'],
        'pairs' => [
            [
                'id' => 'good',
                'rate' => 40.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 40.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                ],
            ],
            [
                'id' => 'bad',
                'rate' => 20.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 40.0, 'volumePrimaryValue' => 100],
                ],
            ],
        ],
        'core' => [
            'items' => [
                ['id' => 'good', 'name' => 'Good Orb', 'image' => '/good.png', 'category' => 'Currency', 'detailsId' => 'good-orb'],
                ['id' => 'bad', 'name' => 'Bad Orb', 'image' => '/bad.png', 'category' => 'Currency', 'detailsId' => 'bad-orb'],
            ],
            'rates' => [],
            'primary' => 'good',
            'secondary' => 'bad',
        ],
    ]],
];

$mixedAveraged = MarketData::getBestInvestmentsForWindow(
    [$mixedSignLeague],
    count: 10,
    currentDayOfLeague: 3,
    daysForward: 2,
    minVolume: 0,
    useAveragePairs: true,
);

check(count($mixedAveraged) === 1, 'the item with one winning and one losing pair still qualifies (via the winning pair)');
check(
    closeTo($mixedAveraged[0]['percentChange'] ?? null, 100.0),
    'useAveragePairs reports just the winning pair\'s own +100%, not an average dragged down by the losing pair\'s -50% (which was never a qualifying candidate)',
);

// useAveragePairs' leagueChanges breakdown must average across pairs
// per-league too (not just carry over the best pair's own breakdown) — two
// leagues where the pairs' coverage differs, so a naive "reuse the best
// pair's leagueChanges" implementation would be caught: league-b only ever
// has data for 'good', never 'great'.
$leagueA = [
    'id' => 'league-a',
    'name' => 'League A',
    'color' => '#aaaaaa',
    'startDate' => $leagueStart,
    'itemEntries' => [[
        'item' => ['id' => 'widget', 'name' => 'Widget', 'image' => '/widget.png', 'category' => 'Currency', 'detailsId' => 'widget'],
        'pairs' => [
            [
                'id' => 'good',
                'rate' => 40.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 40.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                ],
            ],
            [
                'id' => 'great',
                'rate' => 30.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 30.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                ],
            ],
        ],
        'core' => [
            'items' => [
                ['id' => 'good', 'name' => 'Good Orb', 'image' => '/good.png', 'category' => 'Currency', 'detailsId' => 'good-orb'],
                ['id' => 'great', 'name' => 'Great Orb', 'image' => '/great.png', 'category' => 'Currency', 'detailsId' => 'great-orb'],
            ],
            'rates' => [],
            'primary' => 'good',
            'secondary' => 'great',
        ],
    ]],
];
$leagueB = [
    'id' => 'league-b',
    'name' => 'League B',
    'color' => '#bbbbbb',
    'startDate' => $leagueStart,
    'itemEntries' => [[
        'item' => ['id' => 'widget', 'name' => 'Widget', 'image' => '/widget.png', 'category' => 'Currency', 'detailsId' => 'widget'],
        'pairs' => [
            [
                'id' => 'good',
                'rate' => 36.0,
                'volumePrimaryValue' => 100,
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 36.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 20.0, 'volumePrimaryValue' => 100],
                ],
            ],
            // Deliberately no 'great' pair in this league at all.
        ],
        'core' => [
            'items' => [
                ['id' => 'good', 'name' => 'Good Orb', 'image' => '/good.png', 'category' => 'Currency', 'detailsId' => 'good-orb'],
            ],
            'rates' => [],
            'primary' => 'good',
            'secondary' => null,
        ],
    ]],
];

$twoLeagueAveraged = MarketData::getBestInvestmentsForWindow(
    [$leagueA, $leagueB],
    count: 10,
    currentDayOfLeague: 3,
    daysForward: 2,
    minVolume: 0,
    useAveragePairs: true,
);

check(count($twoLeagueAveraged) === 1, 'the two-league fixture yields exactly one investment for widget');
check(
    ($twoLeagueAveraged[0]['pairId'] ?? null) === 'good',
    // good: avg(100%, 80%) = 90%; great: 50% (only league-a) -> good wins
    'the best pair is still \'good\' (its own cross-league average of 90% beats great\'s 50%)',
);
check(
    closeTo($twoLeagueAveraged[0]['percentChange'] ?? null, 70.0),
    'headline percentChange averages both qualifying pairs\' own percentChange (90% and 50% -> 70%)',
);

$twoLeagueChangesByLeague = [];
foreach ($twoLeagueAveraged[0]['leagueChanges'] ?? [] as $change) {
    $twoLeagueChangesByLeague[$change['league']['id']] = $change['percentChange'];
}
check(count($twoLeagueChangesByLeague) === 2, 'the breakdown has one entry per league, not per pair');
check(
    closeTo($twoLeagueChangesByLeague['league-a'] ?? null, 75.0),
    // league-a has both pairs: avg(good=100%, great=50%) = 75%.
    'league-a\'s breakdown entry averages every pair with data there (good 100%, great 50% -> 75%), not just good\'s own 100%',
);
check(
    closeTo($twoLeagueChangesByLeague['league-b'] ?? null, 80.0),
    // league-b only ever has 'good': avg(80%) = 80%, not dragged toward
    // great's number since great has no data there at all.
    'league-b\'s breakdown entry is just good\'s own 80% (great has no data in this league to average in)',
);

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

// --- LeagueRepository: constructing it with a game-scoped $dataDir/$leagueConfigs ---
// --- isolates it entirely from the other game — this is the whole point of ---
// --- resolving `game` once in public/index.php rather than threading it through ---
// --- every method (see backend/config/leagues.php and public/index.php). ---

$allLeagueConfigs = require __DIR__ . '/../config/leagues.php';
$repoDataDir = __DIR__ . '/../../data';

$poe1Repo = new LeagueRepository($repoDataDir . '/poe1', $allLeagueConfigs['poe1']);
$poe2Repo = new LeagueRepository($repoDataDir . '/poe2', $allLeagueConfigs['poe2']);

check(
    $poe1Repo->leagueIds() === ['curse-of-the-allflame', 'mirage', 'keepers-of-the-flame', 'mercenaries'],
    'a POE1-scoped repository only ever sees POE1\'s own league ids',
);
check(
    !in_array('runes-of-aldur', $poe1Repo->leagueIds(), true),
    'a POE1-scoped repository never sees a POE2 league id, even though both games share one leagues.php',
);
check(
    $poe2Repo->leagueIds() === ['runes-of-aldur', 'fate-of-the-vaal', 'rise-of-the-abyssal'],
    'a POE2-scoped repository is unaffected by POE1 existing alongside it',
);

check(
    $poe1Repo->listCategories() === [
        'Allflame Embers', 'Artifacts', 'Currency', 'Divination Cards', 'Fragments', 'Oils', 'Omens', 'Runegrafts', 'Tattoos',
    ],
    'POE1 lists exactly its 9 categories — listCategories() derives this from data/poe1/mirage/*.json alone, not any global/cross-game list',
);
check(
    $poe1Repo->currentLeagueInfo()['id'] === 'curse-of-the-allflame',
    'POE1\'s current-league.json (Curse of the Allflame) is read from the POE1-scoped data dir, independent of POE2\'s',
);

$poe1PairCurrencies = array_map(fn(array $p): string => $p['id'], $poe1Repo->listPairCurrencies());
$poe1Filtered = $poe1Repo->loadFiltered(['mirage'], ['Currency'], $poe1PairCurrencies);
check(
    count($poe1Filtered) === 1 && count($poe1Filtered[0]['itemEntries']) > 0,
    'loadFiltered() against the real ingested Mirage snapshot returns a non-empty item list',
);
check(
    $poe1Filtered[0]['itemEntries'][0]['pairs'] !== [],
    'the real ingested items keep their actual (non-empty) pairs after filtering to POE1\'s own pair-currency list',
);

// --- InvestmentPayloadBuilder::augmentWithLiveLeague drops an item entirely ---
// --- when poe.ninja has no live-league data for it, rather than showing a ---
// --- card that's silently missing the exact overlay the live league was ---
// --- selected for. A pre-seeded, still-fresh cache entry (same technique as
// backend/tests/smoke-poeninja.php) keeps this network-free: PoeNinjaClient
// serves straight from cache within its TTL, no real fetch attempted.

$liveDataEntry = json_decode(json_encode([
    'item' => ['id' => 'chaos', 'name' => 'Chaos Orb', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'chaos-orb'],
    'pairs' => [['id' => 'divine', 'rate' => 100, 'volumePrimaryValue' => 5, 'history' => [['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 100, 'volumePrimaryValue' => 5]]]],
    'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
]), true);

$payloadCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-payload-cache-' . uniqid() . '.json';
file_put_contents($payloadCacheFile, json_encode([
    'chaos-orb' => ['fetchedAt' => time(), 'entry' => $liveDataEntry],
    // A confirmed "poe.ninja has no data for this item in the live league" —
    // same null-entry shape a genuine no-trades-yet response or a fetch
    // failure both collapse to (see PoeNinjaClient::getEntries).
    'no-data-orb' => ['fetchedAt' => time(), 'entry' => null],
]));

$payloadClient = new PoeNinjaClient('Does Not Matter — served from cache', $payloadCacheFile, 'https://example.invalid/details', []);
$payloadBuilder = new InvestmentPayloadBuilder($payloadClient, [
    'id' => 'live-league',
    'name' => 'Live League',
    'startDate' => '2026-01-01T00:00:00Z',
]);

// pairs is normally attached by attachAlternatePairs() before this runs
// (see resolveRankedInvestments/FavoritesController) — supplied by hand
// here since these fixtures skip straight to augmentWithLiveLeague.
$investmentWithLiveData = [
    'item' => ['id' => 'chaos', 'name' => 'Chaos Orb', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'chaos-orb'],
    'pairId' => 'divine',
    'pairName' => 'Divine Orb',
    'pairImage' => null,
    'percentChange' => 10.0,
    'leagueChanges' => [],
    'leagueHistories' => [],
    'pairs' => [['pairId' => 'divine', 'percentChange' => 10.0, 'leagueHistories' => []]],
];
$investmentWithNoLiveData = [
    'item' => ['id' => 'no-data', 'name' => 'No Data Orb', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'no-data-orb'],
    'pairId' => 'divine',
    'pairName' => 'Divine Orb',
    'pairImage' => null,
    'percentChange' => 5.0,
    'leagueChanges' => [],
    'leagueHistories' => [],
    'pairs' => [['pairId' => 'divine', 'percentChange' => 5.0, 'leagueHistories' => []]],
];

$augmented = $payloadBuilder->augmentWithLiveLeague(
    [$investmentWithLiveData, $investmentWithNoLiveData],
    ['live-league'],
    2,
    1,
);

check(
    count($augmented) === 1 && $augmented[0]['item']['id'] === 'chaos',
    'augmentWithLiveLeague drops an investment entirely when poe.ninja has no live-league data for it',
);
check(
    count($augmented) === 1 && count($augmented[0]['leagueHistories']) === 1
        && $augmented[0]['leagueHistories'][0]['league']['id'] === 'live-league',
    'the surviving investment still gets the live league appended as an extra leagueHistories entry',
);
check(
    array_keys($augmented) === [0],
    'the result is re-indexed sequentially after a drop, not left with a gap at key 0 that would serialize as a JSON object instead of an array',
);

@unlink($payloadCacheFile);

// --- augmentWithLiveLeague promotes an alternate pair when the ranked one ---
// --- has no *real* live-league data, rather than dropping the card, and ---
// --- drops entirely only when no pair at all has real data. poe.ninja ---
// returns a zero-volume placeholder row (rate: 1, volumePrimaryValue: 0) for
// a pair with no real trades yet rather than omitting it — that's what
// distinguishes "no real data" from "no data" here.

$placeholderRow = ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 1, 'volumePrimaryValue' => 0];
$realRow = ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 50, 'volumePrimaryValue' => 20];

$promoEntry = json_decode(json_encode([
    'item' => ['id' => 'promo', 'name' => 'Promo Item', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'promo-details'],
    'pairs' => [
        ['id' => 'divine', 'rate' => 1, 'volumePrimaryValue' => 0, 'history' => [$placeholderRow]],
        ['id' => 'chaos', 'rate' => 50, 'volumePrimaryValue' => 20, 'history' => [$realRow]],
    ],
    'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
]), true);

$placeholderOnlyEntry = json_decode(json_encode([
    'item' => ['id' => 'stale', 'name' => 'Stale Item', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'stale-details'],
    'pairs' => [
        ['id' => 'divine', 'rate' => 1, 'volumePrimaryValue' => 0, 'history' => [$placeholderRow]],
    ],
    'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
]), true);

$promoCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-promo-cache-' . uniqid() . '.json';
file_put_contents($promoCacheFile, json_encode([
    'promo-details' => ['fetchedAt' => time(), 'entry' => $promoEntry],
    'stale-details' => ['fetchedAt' => time(), 'entry' => $placeholderOnlyEntry],
]));

$promoClient = new PoeNinjaClient('Does Not Matter — served from cache', $promoCacheFile, 'https://example.invalid/details', []);
$promoBuilder = new InvestmentPayloadBuilder($promoClient, [
    'id' => 'live-league',
    'name' => 'Live League',
    'startDate' => '2026-01-01T00:00:00Z',
]);

$staticLeague = ['id' => 'static-league', 'startDate' => '2026-01-01T00:00:00Z'];

$promoInvestment = [
    'item' => ['id' => 'promo', 'name' => 'Promo Item', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'promo-details'],
    // Ranked on divine (the pair with no real live data), same as the real
    // "Allflame Ember of Flesh" case this whole thing was written for.
    'pairId' => 'divine',
    'pairName' => 'Divine Orb',
    'pairImage' => null,
    'percentChange' => 999.0,
    'leagueChanges' => [['league' => $staticLeague, 'percentChange' => 999.0]],
    'leagueHistories' => [['league' => $staticLeague, 'history' => [$placeholderRow]]],
    'pairs' => [
        ['pairId' => 'divine', 'percentChange' => 999.0, 'leagueHistories' => [['league' => $staticLeague, 'history' => [$placeholderRow]]]],
        ['pairId' => 'chaos', 'percentChange' => 42.0, 'leagueHistories' => [['league' => $staticLeague, 'history' => [$realRow]]]],
    ],
];

$staleInvestment = [
    'item' => ['id' => 'stale', 'name' => 'Stale Item', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'stale-details'],
    'pairId' => 'divine',
    'pairName' => 'Divine Orb',
    'pairImage' => null,
    'percentChange' => 1.0,
    'leagueChanges' => [],
    'leagueHistories' => [],
    'pairs' => [
        ['pairId' => 'divine', 'percentChange' => 1.0, 'leagueHistories' => [['league' => $staticLeague, 'history' => [$placeholderRow]]]],
    ],
];

$promoted = $promoBuilder->augmentWithLiveLeague([$promoInvestment, $staleInvestment], ['live-league'], 2, 1);

check(
    count($promoted) === 1 && $promoted[0]['item']['id'] === 'promo',
    'the item ranked on a pair with no real live data survives (promoted), while the item where no pair has real live data is dropped',
);
check(
    ($promoted[0]['pairId'] ?? null) === 'chaos',
    'the ranked pair is swapped to the best alternate that actually has real live-league data',
);
check(
    ($promoted[0]['percentChange'] ?? null) === 42.0,
    'percentChange is updated to the promoted pair\'s own value, not left as the old (divine) ranked pair\'s',
);
check(
    count($promoted[0]['pairs'] ?? []) === 1 && $promoted[0]['pairs'][0]['pairId'] === 'chaos',
    'the pair-switcher list itself drops the no-real-data pair (divine) too, not just the main display',
);

@unlink($promoCacheFile);

// --- augmentWithLiveLeague also promotes when the ranked pair's own real ---
// --- trade data has gone stale relative to a sibling pair, not just when ---
// --- it's a bare zero-volume placeholder. Reproduces the real "Clear Oil" ---
// bug report: the ranked pair (divine) genuinely traded a couple of days ago
// (a non-zero-volume row, so the old hasRealTradeData("any real row ever")
// check wrongly kept it), but chaos has since traded *today* while divine
// hasn't — divine's own latest row lags behind the item's freshest
// available date, so it must be treated the same as having no current data.

$yesterdayRealRow = ['timestamp' => '2026-01-01T00:00:00Z', 'rate' => 40, 'volumePrimaryValue' => 15];
$todayRealRow = ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 50, 'volumePrimaryValue' => 20];

$staleRankedEntry = json_decode(json_encode([
    'item' => ['id' => 'oil', 'name' => 'Clear Oil', 'image' => '/x.png', 'category' => 'Oils', 'detailsId' => 'clear-oil'],
    'pairs' => [
        // divine really did trade — just not as recently as chaos.
        ['id' => 'divine', 'rate' => 40, 'volumePrimaryValue' => 15, 'history' => [$yesterdayRealRow]],
        ['id' => 'chaos', 'rate' => 50, 'volumePrimaryValue' => 20, 'history' => [$todayRealRow]],
    ],
    'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
]), true);

$staleRankedCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-stale-ranked-cache-' . uniqid() . '.json';
file_put_contents($staleRankedCacheFile, json_encode([
    'clear-oil' => ['fetchedAt' => time(), 'entry' => $staleRankedEntry],
]));

$staleRankedClient = new PoeNinjaClient('Does Not Matter — served from cache', $staleRankedCacheFile, 'https://example.invalid/details', []);
$staleRankedBuilder = new InvestmentPayloadBuilder($staleRankedClient, [
    'id' => 'live-league',
    'name' => 'Live League',
    'startDate' => '2026-01-01T00:00:00Z',
]);

$staleRankedInvestment = [
    'item' => ['id' => 'oil', 'name' => 'Clear Oil', 'image' => '/x.png', 'category' => 'Oils', 'detailsId' => 'clear-oil'],
    'pairId' => 'divine',
    'pairName' => 'Divine Orb',
    'pairImage' => null,
    'percentChange' => 999.0,
    'leagueChanges' => [['league' => $staticLeague, 'percentChange' => 999.0]],
    'leagueHistories' => [['league' => $staticLeague, 'history' => [$yesterdayRealRow]]],
    'pairs' => [
        ['pairId' => 'divine', 'percentChange' => 999.0, 'leagueHistories' => [['league' => $staticLeague, 'history' => [$yesterdayRealRow]]]],
        ['pairId' => 'chaos', 'percentChange' => 42.0, 'leagueHistories' => [['league' => $staticLeague, 'history' => [$todayRealRow]]]],
    ],
];

$staleRankedPromoted = $staleRankedBuilder->augmentWithLiveLeague([$staleRankedInvestment], ['live-league'], 2, 1);

check(
    count($staleRankedPromoted) === 1 && ($staleRankedPromoted[0]['pairId'] ?? null) === 'chaos',
    'a ranked pair whose own latest real trade lags behind a sibling pair\'s (real, but not current) is promoted away, not kept just because it once had real volume',
);

@unlink($staleRankedCacheFile);

// --- InvestmentPayloadBuilder::resolveRankedInvestments backfills past ---
// --- dropped items so the response still has $count investments (as long ---
// --- as the ranked pool has enough candidates left), instead of silently ---
// --- shrinking below what was asked for. Four ranked candidates, best to
// worst: item1 (uncached — genuinely fails to fetch), item2 (cached, has
// data), item3 (uncached — fails), item4 (cached, has data) — requesting 2
// should skip both failures and land on [item2, item4].
//
// item1/item3 are deliberately left OUT of the cache (rather than cached
// with a null entry, like the single-item test above) so this can also
// verify attemptedCount/failedItemIds actually accumulate across batches:
// a cache HIT never counts as "attempted" regardless of its value, so an
// all-cached fixture would report attemptedCount 0 no matter how many
// batches ran — this needs at least one genuine fetch per batch to
// distinguish "only the last batch's stats" from "every batch's stats".
// The fetch itself still can't reach a real network: '.invalid' is an
// IANA-reserved TLD guaranteed to fail DNS resolution immediately.

$backfillCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-backfill-cache-' . uniqid() . '.json';

function smokeFakeLiveEntry(string $detailsId): array
{
    return json_decode(json_encode([
        'item' => ['id' => $detailsId, 'name' => $detailsId, 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => $detailsId],
        // A non-empty history with a real (non-zero) volume — not just the
        // pair's own top-level rate/volumePrimaryValue — since
        // hasRealTradeData() (augmentWithLiveLeague) checks the history
        // rows themselves, matching what a genuine poe.ninja response
        // always pairs a non-placeholder rate/volume with.
        'pairs' => [['id' => 'divine', 'rate' => 1, 'volumePrimaryValue' => 1, 'history' => [
            ['timestamp' => '2026-01-01T00:00:00Z', 'rate' => 1, 'volumePrimaryValue' => 1],
        ]]],
        'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
    ]), true);
}

file_put_contents($backfillCacheFile, json_encode([
    'item2-details' => ['fetchedAt' => time(), 'entry' => smokeFakeLiveEntry('item2-details')],
    'item4-details' => ['fetchedAt' => time(), 'entry' => smokeFakeLiveEntry('item4-details')],
]));

$backfillClient = new PoeNinjaClient('Does Not Matter — served from cache', $backfillCacheFile, 'https://example.invalid/details', []);
$backfillBuilder = new InvestmentPayloadBuilder($backfillClient, [
    'id' => 'live-league',
    'name' => 'Live League',
    'startDate' => '2026-01-01T00:00:00Z',
]);

function smokeFixtureInvestment(string $itemId, float $percentChange): array
{
    return [
        'item' => ['id' => $itemId, 'name' => $itemId, 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => "{$itemId}-details"],
        'pairId' => 'divine',
        'pairName' => 'Divine Orb',
        'pairImage' => null,
        'percentChange' => $percentChange,
        'leagueChanges' => [],
        'leagueHistories' => [],
    ];
}

$rankedPool = [
    smokeFixtureInvestment('item1', 40.0),
    smokeFixtureInvestment('item2', 30.0),
    smokeFixtureInvestment('item3', 20.0),
    smokeFixtureInvestment('item4', 10.0),
];

$resolved = $backfillBuilder->resolveRankedInvestments($rankedPool, 2, [], ['live-league'], 3, 3);

check(
    count($resolved['investments']) === 2,
    'resolveRankedInvestments backfills past dropped items to still return the requested count',
);
check(
    array_map(fn(array $inv): string => $inv['item']['id'], $resolved['investments']) === ['item2', 'item4'],
    'the survivors are exactly the ranked candidates that actually had live-league data, in rank order, skipping the two that didn\'t',
);
check(
    $resolved['poeNinjaStatus']['attemptedCount'] === 2,
    'poeNinjaStatus accumulates attemptedCount across every backfill batch (item1 in round 1, item3 in round 2 — item2/item4 are cache hits and don\'t count), not just the last round',
);
check(
    $resolved['poeNinjaStatus']['failedItemIds'] === ['item1-details', 'item3-details'],
    'failedItemIds accumulates across batches too, in the order each genuine failure was actually encountered',
);
check(
    array_map(fn(array $f): string => $f['itemId'], $resolved['poeNinjaStatus']['failedItems']) === ['item1-details', 'item3-details']
        && array_map(fn(array $f): string => $f['itemName'], $resolved['poeNinjaStatus']['failedItems']) === ['item1', 'item3']
        && array_map(fn(array $f): bool => str_contains($f['url'], 'example.invalid') && str_contains($f['url'], $f['itemId']), $resolved['poeNinjaStatus']['failedItems']) === [true, true],
    'failedItems carries each failure\'s item name and the exact poe.ninja request URL that failed, not just its id',
);

$exhaustedPool = [smokeFixtureInvestment('item1', 40.0), smokeFixtureInvestment('item3', 20.0)];
$exhausted = $backfillBuilder->resolveRankedInvestments($exhaustedPool, 2, [], ['live-league'], 3, 3);
check(
    count($exhausted['investments']) === 0,
    'asking for more than the pool can supply after drops returns fewer (here zero) rather than looping forever or erroring',
);

@unlink($backfillCacheFile);

// --- resolveRankedInvestments drops (and backfills past) an investment ---
// --- whose *promoted* pair turns out to be a loss, and re-sorts the final ---
// --- list by each survivor's actual (possibly promoted) percentChange ---
// --- rather than trusting $rankedPool's original (pre-promotion) order. ---
// Reproduces the real "Allflame Ember of Flesh" bug report: an item ranked
// #1 on its divine pair (no live data) must not surface as a "best
// investment" once promoted to a pair (chaos) that's actually a loss.

$sortCacheFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-sort-cache-' . uniqid() . '.json';

// Live-league entry with a real (non-placeholder) trade on 'chaos' but not
// 'divine' — the ranked pair ('divine') always promotes to 'chaos' here.
// The *sign* of the resulting percentChange comes from $sortLeague's own
// static history below (attachAlternatePairs/getAllPairsForItem), not from
// this live entry — see augmentWithLiveLeague's promotion branch, which
// carries over the alternate pair's already-computed static percentChange
// rather than deriving a new one from the live data.
function smokePromotableLiveEntry(string $detailsId): array
{
    return json_decode(json_encode([
        'item' => ['id' => $detailsId, 'name' => $detailsId, 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => $detailsId],
        'pairs' => [
            ['id' => 'divine', 'rate' => 1, 'volumePrimaryValue' => 0, 'history' => [
                ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 1, 'volumePrimaryValue' => 0],
            ]],
            ['id' => 'chaos', 'rate' => 1, 'volumePrimaryValue' => 20, 'history' => [
                ['timestamp' => '2026-01-02T00:00:00Z', 'rate' => 1, 'volumePrimaryValue' => 20],
            ]],
        ],
        'core' => ['items' => [], 'rates' => [], 'primary' => 'chaos', 'secondary' => 'divine'],
    ]), true);
}

file_put_contents($sortCacheFile, json_encode([
    // itemLoss: ranked #1 (999%) on divine, but its only real-data pair
    // (chaos) is actually a loss once promoted.
    'itemLoss-details' => ['fetchedAt' => time(), 'entry' => smokePromotableLiveEntry('itemLoss-details')],
    // itemLowPromo: ranked #2 (500%) on divine, promotes to chaos at a real
    // (positive) but modest gain — lower than the other survivors' own
    // static percentChange, so a correct re-sort must push it to last.
    'itemLowPromo-details' => ['fetchedAt' => time(), 'entry' => smokePromotableLiveEntry('itemLowPromo-details')],
    // item3/item4 (reused fixture ids from the backfill test above): real
    // live data straight on their own ranked pair, untouched by promotion.
    'item3-details' => ['fetchedAt' => time(), 'entry' => smokeFakeLiveEntry('item3-details')],
    'item4-details' => ['fetchedAt' => time(), 'entry' => smokeFakeLiveEntry('item4-details')],
]));

$sortClient = new PoeNinjaClient('Does Not Matter — served from cache', $sortCacheFile, 'https://example.invalid/details', []);
$sortBuilder = new InvestmentPayloadBuilder($sortClient, [
    'id' => 'live-league',
    'name' => 'Live League',
    'startDate' => '2026-01-01T00:00:00Z',
]);

// Static league feeding attachAlternatePairs/getAllPairsForItem: itemLoss's
// chaos pair falls (day1 rate 10 -> day5 rate 8, a real loss); itemLowPromo's
// chaos pair rises only slightly (day1 rate 10 -> day5 rate 11).
$sortLeague = [
    'id' => 'sort-static-league',
    'name' => 'Sort Static League',
    'color' => '#000000',
    'startDate' => $leagueStart,
    'itemEntries' => [
        [
            'item' => ['id' => 'itemLoss', 'name' => 'itemLoss', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'itemLoss-details'],
            'pairs' => [[
                'id' => 'chaos',
                'rate' => 80.0,
                'volumePrimaryValue' => 100,
                // day3 (currentDayOfLeague, the window start) rate 100 ->
                // day5 (window end) rate 80: a real -20% loss.
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 80.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 100.0, 'volumePrimaryValue' => 100],
                ],
            ]],
        ],
        [
            'item' => ['id' => 'itemLowPromo', 'name' => 'itemLowPromo', 'image' => '/x.png', 'category' => 'Currency', 'detailsId' => 'itemLowPromo-details'],
            'pairs' => [[
                'id' => 'chaos',
                'rate' => 105.0,
                'volumePrimaryValue' => 100,
                // day3 (currentDayOfLeague, the window start) rate 100 ->
                // day5 (window end) rate 105: a real but modest +5% gain —
                // lower than item3's 20% and item4's 10%, so a correct
                // re-sort must push this to last despite outranking both
                // pre-promotion.
                'history' => [
                    ['timestamp' => '2026-01-05T00:00:00Z', 'rate' => 105.0, 'volumePrimaryValue' => 100],
                    ['timestamp' => '2026-01-03T00:00:00Z', 'rate' => 100.0, 'volumePrimaryValue' => 100],
                ],
            ]],
        ],
    ],
];

$sortPool = [
    smokeFixtureInvestment('itemLoss', 999.0),
    smokeFixtureInvestment('itemLowPromo', 500.0),
    smokeFixtureInvestment('item3', 20.0),
    smokeFixtureInvestment('item4', 10.0),
];

$sortResolved = $sortBuilder->resolveRankedInvestments($sortPool, 3, [$sortLeague], ['live-league'], 3, 2);

check(
    !in_array('itemLoss', array_map(fn(array $inv): string => $inv['item']['id'], $sortResolved['investments']), true),
    'an item promoted to a losing pair is dropped from best investments, not shown despite a negative percentChange',
);
check(
    count($sortResolved['investments']) === 3,
    'the dropped item is backfilled from the rest of the pool so the requested count is still met',
);
$sortedIds = array_map(fn(array $inv): string => $inv['item']['id'], $sortResolved['investments']);
$sortedChanges = array_map(fn(array $inv): float => $inv['percentChange'], $sortResolved['investments']);
check(
    $sortedChanges[0] >= $sortedChanges[1] && $sortedChanges[1] >= $sortedChanges[2],
    'survivors are re-sorted by their actual (possibly promoted) percentChange, not left in the pool\'s original pre-promotion order',
);
check(
    end($sortedIds) === 'itemLowPromo',
    'itemLowPromo (ranked #2 pre-promotion, but only a small real gain once promoted) correctly drops to last after re-sorting',
);

@unlink($sortCacheFile);

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} check(s) failed.\n");
    exit(1);
}

echo "\nAll checks passed.\n";
