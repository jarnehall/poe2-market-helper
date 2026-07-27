<?php

declare(strict_types=1);

namespace App\Domain;

// Ported from the old src/lib/marketData.ts — only the subset reachable from
// getBestInvestmentsForWindow. Operates on plain associative arrays decoded
// straight from the JSON data files (see DataAccess\LeagueRepository), using
// the same field names as those files/the old TS types.
final class MarketData
{
    private const SECONDS_PER_DAY = 86400;

    // Memoized across calls (safe as a `static` cache, unlike the per-league
    // item indexes elsewhere in this class: a given timestamp *string*
    // always parses to the same instant, regardless of which leagues/
    // categories/pairs a particular request selected, so there's no
    // staleness risk here). The same handful of daily timestamps repeat
    // across every item's history, so this collapses tens of thousands of
    // strtotime() calls — the dominant cost of ranking a realistic-size
    // catalog — down to a few dozen.
    private static array $timestampCache = [];

    private static function parseTimestamp(string $timestamp): int
    {
        return self::$timestampCache[$timestamp] ??= strtotime($timestamp);
    }

    /**
     * history is sorted newest-first; returns every entry oldest-first, with
     * each entry's day-over-day percent change, its day of the league, and
     * whether it's currentDayOfLeague.
     *
     * dayOfLeague is measured in real elapsed days from this pair's own
     * oldest history entry, not by array position — a pair that's rarely
     * traded can have real gaps of several days between snapshots, and
     * treating those as consecutive days would both understate the gap and
     * wildly overstate the day-over-day change.
     */
    public static function getAllHistoryRows(array $history, int $currentDayOfLeague): array
    {
        $n = count($history);
        if ($n === 0) {
            return [];
        }

        $oldestTime = self::parseTimestamp($history[$n - 1]['timestamp']);
        $rows = [];

        for ($originalIndex = $n - 1; $originalIndex >= 0; $originalIndex--) {
            $entry = $history[$originalIndex];
            $previousEntry = $originalIndex + 1 < $n ? $history[$originalIndex + 1] : null;
            $percentChange = $previousEntry !== null
                ? (($entry['rate'] - $previousEntry['rate']) / $previousEntry['rate']) * 100
                : null;
            $dayOfLeague = (int) round((self::parseTimestamp($entry['timestamp']) - $oldestTime) / self::SECONDS_PER_DAY) + 1;

            $rows[] = [
                'entry' => $entry,
                'percentChange' => $percentChange,
                'isCurrentDay' => $dayOfLeague === $currentDayOfLeague,
                'dayOfLeague' => $dayOfLeague,
            ];
        }

        return $rows;
    }

    /** Narrows a full, oldest-first row list to daysBefore/daysAfter around currentDayOfLeague. */
    public static function getHistoryRowsInWindow(array $rows, int $daysBefore, int $daysAfter, int $currentDayOfLeague): array
    {
        $startDay = $currentDayOfLeague - $daysBefore;
        $endDay = $currentDayOfLeague + $daysAfter;

        return array_values(array_filter(
            $rows,
            fn(array $row): bool => $row['dayOfLeague'] >= $startDay && $row['dayOfLeague'] <= $endDay,
        ));
    }

    private static function findRowByDay(array $rows, int $day): ?array
    {
        foreach ($rows as $row) {
            if ($row['dayOfLeague'] === $day) {
                return $row;
            }
        }

        return null;
    }

    /**
     * Percent change from daysBack days before currentDayOfLeague to
     * daysForward days after it. Falls back to currentDayOfLeague itself as
     * the start if there's no data that far back, so the change is still
     * based on the future data available. Null only if even that isn't in
     * the history.
     */
    public static function getWindowPercentChange(array $history, int $currentDayOfLeague, int $daysBack, int $daysForward): ?float
    {
        return self::windowPercentChangeFromRows(
            self::getAllHistoryRows($history, $currentDayOfLeague),
            $currentDayOfLeague,
            $daysBack,
            $daysForward,
        );
    }

    private static function windowPercentChangeFromRows(array $rows, int $currentDayOfLeague, int $daysBack, int $daysForward): ?float
    {
        $beforeRow = self::findRowByDay($rows, $currentDayOfLeague - $daysBack);
        $currentRow = self::findRowByDay($rows, $currentDayOfLeague);
        $startRow = $beforeRow ?? $currentRow;
        $endRow = self::findRowByDay($rows, $currentDayOfLeague + $daysForward);

        if ($startRow === null || $endRow === null) {
            return null;
        }

        return (($endRow['entry']['rate'] - $startRow['entry']['rate']) / $startRow['entry']['rate']) * 100;
    }

    /** A pair's trade volume on exactly currentDayOfLeague, or null if there's no entry for that day. */
    public static function getVolumeForDay(array $history, int $currentDayOfLeague): ?float
    {
        return self::volumeFromRows(self::getAllHistoryRows($history, $currentDayOfLeague), $currentDayOfLeague);
    }

    private static function volumeFromRows(array $rows, int $currentDayOfLeague): ?float
    {
        $row = self::findRowByDay($rows, $currentDayOfLeague);

        return $row ? $row['entry']['volumePrimaryValue'] : null;
    }

    private static function average(array $values): ?float
    {
        if (count($values) === 0) {
            return null;
        }

        return array_sum($values) / count($values);
    }

    /** Every league (from those given) that carries this exact item+pair, paired with that pair's history. */
    public static function getLeagueHistoriesForPair(array $leagues, string $itemId, string $pairId): array
    {
        $results = [];

        foreach ($leagues as $league) {
            $entry = null;
            foreach ($league['itemEntries'] as $candidate) {
                if ($candidate['item']['id'] === $itemId) {
                    $entry = $candidate;
                    break;
                }
            }
            if ($entry === null) {
                continue;
            }

            $pair = null;
            foreach ($entry['pairs'] as $candidate) {
                if ($candidate['id'] === $pairId) {
                    $pair = $candidate;
                    break;
                }
            }
            if ($pair !== null) {
                $results[] = ['league' => $league, 'history' => $pair['history']];
            }
        }

        return $results;
    }

    /** Every item across the given leagues, deduplicated by item id, with the union of pair ids any league has for it. */
    public static function getMergedItemEntries(array $leagues): array
    {
        $byItemId = [];

        foreach ($leagues as $league) {
            foreach ($league['itemEntries'] as $entry) {
                $itemId = $entry['item']['id'];
                if (!isset($byItemId[$itemId])) {
                    $byItemId[$itemId] = ['item' => $entry['item'], 'pairIds' => []];
                }
                foreach ($entry['pairs'] as $pair) {
                    if (!in_array($pair['id'], $byItemId[$itemId]['pairIds'], true)) {
                        $byItemId[$itemId]['pairIds'][] = $pair['id'];
                    }
                }
            }
        }

        return array_values($byItemId);
    }

    /**
     * The best things to hold on currentDayOfLeague, based on the rate
     * change from daysBack days before it to daysForward days after it,
     * averaged across the given leagues. Only actual gains are included;
     * losses are never "a best investment". Each item appears at most once,
     * represented by its best-performing pair.
     */
    public static function getBestInvestmentsForWindow(
        array $leagues,
        int $count,
        int $currentDayOfLeague,
        int $daysBack,
        int $daysForward,
        float $minVolume,
    ): array {
        // Indexed once per call (a plain local variable — never a `static`
        // cache across requests, since itemEntries differ by request
        // depending on which categories/pair currencies were selected).
        // Without this, finding a league's entry for a given item id was an
        // O(itemsInThatLeague) linear scan repeated for every (item, pair,
        // league) triple below — on a realistic catalog (hundreds of items
        // per league) that dominated this function's cost by roughly two
        // orders of magnitude.
        $itemEntriesByLeagueId = [];
        foreach ($leagues as $league) {
            $byItemId = [];
            foreach ($league['itemEntries'] as $entry) {
                $byItemId[$entry['item']['id']] = $entry;
            }
            $itemEntriesByLeagueId[$league['id']] = $byItemId;
        }

        $bestByItemId = [];

        foreach (self::getMergedItemEntries($leagues) as $merged) {
            $item = $merged['item'];

            foreach ($merged['pairIds'] as $pairId) {
                $volumes = [];
                $leagueChanges = [];
                $leagueHistories = [];

                foreach ($leagues as $league) {
                    $entry = $itemEntriesByLeagueId[$league['id']][$item['id']] ?? null;
                    if ($entry === null) {
                        continue;
                    }

                    $pair = null;
                    foreach ($entry['pairs'] as $candidate) {
                        if ($candidate['id'] === $pairId) {
                            $pair = $candidate;
                            break;
                        }
                    }
                    if ($pair === null) {
                        continue;
                    }

                    $leagueHistories[] = ['league' => $league, 'history' => $pair['history']];

                    // Computed once and reused for both the volume and the
                    // percent change below — the old code called
                    // getVolumeForDay() and getWindowPercentChange()
                    // separately, each silently recomputing getAllHistoryRows()
                    // (and its per-entry strtotime() parsing) from scratch.
                    $rows = self::getAllHistoryRows($pair['history'], $currentDayOfLeague);

                    $volume = self::volumeFromRows($rows, $currentDayOfLeague);
                    if ($volume !== null) {
                        $volumes[] = $volume;
                    }

                    $change = self::windowPercentChangeFromRows($rows, $currentDayOfLeague, $daysBack, $daysForward);
                    if ($change !== null) {
                        $leagueChanges[] = ['league' => $league, 'percentChange' => $change];
                    }
                }

                $volume = self::average($volumes);
                if ($volume === null || $volume < $minVolume) {
                    continue;
                }

                $percentChange = self::average(array_map(fn(array $c): float => $c['percentChange'], $leagueChanges));
                if ($percentChange === null || $percentChange <= 0) {
                    continue;
                }

                $existing = $bestByItemId[$item['id']] ?? null;
                if ($existing === null || $percentChange > $existing['percentChange']) {
                    $bestByItemId[$item['id']] = [
                        'item' => $item,
                        'pairId' => $pairId,
                        'percentChange' => $percentChange,
                        'leagueChanges' => $leagueChanges,
                        'leagueHistories' => $leagueHistories,
                    ];
                }
            }
        }

        $result = array_values($bestByItemId);
        usort($result, fn(array $a, array $b): int => $b['percentChange'] <=> $a['percentChange']);

        return array_slice($result, 0, $count);
    }

    /** Every core item across a league's itemEntries, indexed by id — lets a pair's display name/image be looked up without its own full item entry. */
    // Deliberately NOT cached across calls with a `static` variable keyed by
    // league id: itemEntries for the same league id differ from one request
    // to the next depending on which categories/pair currencies were
    // selected, and PHP's built-in dev server (and PHP-FPM workers in
    // production) keep `static` state alive across requests in the same
    // process — a cache keyed only by league id would silently serve a
    // previous request's (wrong) core-items index. This is only called
    // `count` times per request (a handful), so rebuilding it is cheap.
    private static function getCoreItemsById(array $league): array
    {
        $byId = [];
        foreach ($league['itemEntries'] as $entry) {
            foreach ($entry['core']['items'] as $coreItem) {
                $byId[$coreItem['id']] = $coreItem;
            }
        }

        return $byId;
    }

    /** Looks a pair's display name up across every given league, using whichever one has it first. */
    public static function getPairDisplayName(string $pairId, array $leagues): string
    {
        foreach ($leagues as $league) {
            $coreItems = self::getCoreItemsById($league);
            if (isset($coreItems[$pairId])) {
                return $coreItems[$pairId]['name'];
            }
        }

        return $pairId;
    }

    /** Looks a pair's raw image path up across every given league, using whichever one has it first. */
    public static function getPairImage(string $pairId, array $leagues): ?string
    {
        foreach ($leagues as $league) {
            $coreItems = self::getCoreItemsById($league);
            if (isset($coreItems[$pairId])) {
                return $coreItems[$pairId]['image'];
            }
        }

        return null;
    }
}
