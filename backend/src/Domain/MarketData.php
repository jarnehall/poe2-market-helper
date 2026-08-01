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

    // Snaps an already-parsed instant UP to the next UTC midnight (a no-op if
    // it's already exactly midnight). A league's startDate is a real launch
    // *moment* (e.g. 19:00Z), and no trading — so no history snapshot — can
    // exist before that moment; the first midnight-anchored daily snapshot
    // that can possibly reflect any real post-launch data is the one at or
    // after startDate, i.e. the *next* midnight when startDate isn't already
    // exactly midnight. So day 1 means the calendar date of that first
    // possible snapshot, not startDate's own calendar date.
    private static function ceilToUtcMidnight(int $epochSeconds): int
    {
        $days = intdiv($epochSeconds, self::SECONDS_PER_DAY);
        if ($epochSeconds % self::SECONDS_PER_DAY !== 0) {
            $days++;
        }

        return $days * self::SECONDS_PER_DAY;
    }

    /**
     * history is sorted newest-first; returns every entry oldest-first, with
     * each entry's day-over-day percent change, its day of the league, and
     * whether it's currentDayOfLeague.
     *
     * dayOfLeague is always measured from the league's own startDate — never
     * from this pair's own oldest history entry — so day 1 means the same
     * calendar date for every item in a league. An item with no trades yet
     * on day 1 (or any other gap) just has no row for that day, rather than
     * day 1 silently meaning a different real date per item; not by array
     * position either, since a rarely-traded pair can have real gaps of
     * several days between snapshots.
     */
    public static function getAllHistoryRows(array $history, string $startDate, int $currentDayOfLeague): array
    {
        $n = count($history);
        if ($n === 0) {
            return [];
        }

        $oldestTime = self::ceilToUtcMidnight(self::parseTimestamp($startDate));
        $rows = [];

        for ($originalIndex = $n - 1; $originalIndex >= 0; $originalIndex--) {
            $entry = $history[$originalIndex];
            $previousEntry = $originalIndex + 1 < $n ? $history[$originalIndex + 1] : null;
            $percentChange = $previousEntry !== null
                ? (($entry['rate'] - $previousEntry['rate']) / $previousEntry['rate']) * 100
                : null;
            $entryTime = self::ceilToUtcMidnight(self::parseTimestamp($entry['timestamp']));
            $dayOfLeague = (int) round(($entryTime - $oldestTime) / self::SECONDS_PER_DAY) + 1;

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
     * Percent change from currentDayOfLeague to daysForward days after it.
     * Days before currentDayOfLeague are purely a chart-visualization
     * concern (see getHistoryRowsInWindow) and never factor into this
     * calculation — the window always starts exactly on the selected day.
     * Null if either endpoint isn't in the history.
     */
    public static function getWindowPercentChange(array $history, string $startDate, int $currentDayOfLeague, int $daysForward): ?float
    {
        return self::windowPercentChangeFromRows(
            self::getAllHistoryRows($history, $startDate, $currentDayOfLeague),
            $currentDayOfLeague,
            $daysForward,
        );
    }

    private static function windowPercentChangeFromRows(array $rows, int $currentDayOfLeague, int $daysForward): ?float
    {
        $startRow = self::findRowByDay($rows, $currentDayOfLeague);
        $endRow = self::findRowByDay($rows, $currentDayOfLeague + $daysForward);

        if ($startRow === null || $endRow === null) {
            return null;
        }

        return (($endRow['entry']['rate'] - $startRow['entry']['rate']) / $startRow['entry']['rate']) * 100;
    }

    /** A pair's trade volume on exactly currentDayOfLeague, or null if there's no entry for that day. */
    public static function getVolumeForDay(array $history, string $startDate, int $currentDayOfLeague): ?float
    {
        return self::volumeFromRows(self::getAllHistoryRows($history, $startDate, $currentDayOfLeague), $currentDayOfLeague);
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

    /**
     * Per league, the average percentChange across every one of $qualifyingPairs
     * that has data for that league — not every pair necessarily does, so
     * each league's average is only over whichever pairs actually reached
     * it, same as a single pair's own percentChange only averages over the
     * leagues it has data for. Used for the leagueChanges breakdown in
     * getBestInvestmentsForWindow's $useAveragePairs mode, so a league's
     * breakdown figure and the headline percentChange agree with each
     * other about what's being averaged.
     */
    private static function averageLeagueChangesAcrossPairs(array $qualifyingPairs): array
    {
        $changesByLeagueId = [];
        $leagueById = [];

        foreach ($qualifyingPairs as $pair) {
            foreach ($pair['leagueChanges'] as $change) {
                $leagueId = $change['league']['id'];
                $changesByLeagueId[$leagueId][] = $change['percentChange'];
                $leagueById[$leagueId] = $change['league'];
            }
        }

        $result = [];
        foreach ($changesByLeagueId as $leagueId => $changes) {
            $result[] = ['league' => $leagueById[$leagueId], 'percentChange' => self::average($changes)];
        }

        return $result;
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
     * change from currentDayOfLeague to daysForward days after it, averaged
     * across the given leagues. Only actual gains are included; losses are
     * never "a best investment". Each item appears at most once, represented
     * by its best-performing pair — unless $useAveragePairs is set, in which
     * case the item's reported/ranked percentChange is instead the average
     * across *every* qualifying pair it has (still each pair's own
     * volume/minVolume and positive-change requirements apply first; a pair
     * that doesn't clear those simply isn't part of the average, same as it
     * wouldn't be a candidate for "best" otherwise). The per-league
     * leagueChanges breakdown follows the same rule as the headline number —
     * each league's own average across every qualifying pair, not just the
     * best one — so the two stay consistent with each other; only the
     * chart/versus display always comes from the single best-performing
     * pair regardless of mode.
     *
     * Just the top $count of getRankedInvestments (below) — kept as its own
     * method since most callers only ever want a fixed-size top-N and
     * pre-existing tests already assert exactly that. BestInvestmentsController
     * calls getRankedInvestments directly instead, when it needs access to
     * the rest of the ranked pool too (backfilling past an item poe.ninja
     * turns out to have no live-league data for — see
     * InvestmentPayloadBuilder::applyLiveLeague).
     */
    public static function getBestInvestmentsForWindow(
        array $leagues,
        int $count,
        int $currentDayOfLeague,
        int $daysForward,
        float $minVolume,
        bool $useAveragePairs = false,
    ): array {
        return array_slice(
            self::getRankedInvestments($leagues, $currentDayOfLeague, $daysForward, $minVolume, $useAveragePairs),
            0,
            $count,
        );
    }

    /**
     * Same ranking as getBestInvestmentsForWindow, but returns every
     * qualifying investment (sorted, best first) rather than just the top
     * $count of them.
     */
    public static function getRankedInvestments(
        array $leagues,
        int $currentDayOfLeague,
        int $daysForward,
        float $minVolume,
        bool $useAveragePairs = false,
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

            // Every pair of this item that clears minVolume and has a
            // positive average change — i.e. every candidate that could be
            // "the best pair" — collected up front so $useAveragePairs can
            // average across all of them; the single best of these (by its
            // own percentChange) is always what supplies the chart/versus
            // display, in both modes.
            $qualifyingPairs = [];

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
                    $rows = self::getAllHistoryRows($pair['history'], $league['startDate'], $currentDayOfLeague);

                    $volume = self::volumeFromRows($rows, $currentDayOfLeague);
                    if ($volume !== null) {
                        $volumes[] = $volume;
                    }

                    $change = self::windowPercentChangeFromRows($rows, $currentDayOfLeague, $daysForward);
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

                $qualifyingPairs[] = [
                    'pairId' => $pairId,
                    'percentChange' => $percentChange,
                    'leagueChanges' => $leagueChanges,
                    'leagueHistories' => $leagueHistories,
                ];
            }

            if ($qualifyingPairs === []) {
                continue;
            }

            $best = $qualifyingPairs[0];
            foreach ($qualifyingPairs as $candidate) {
                if ($candidate['percentChange'] > $best['percentChange']) {
                    $best = $candidate;
                }
            }

            $percentChange = $useAveragePairs
                ? self::average(array_map(fn(array $pair): float => $pair['percentChange'], $qualifyingPairs))
                : $best['percentChange'];
            $leagueChanges = $useAveragePairs
                ? self::averageLeagueChangesAcrossPairs($qualifyingPairs)
                : $best['leagueChanges'];

            $bestByItemId[$item['id']] = [
                'item' => $item,
                'pairId' => $best['pairId'],
                'percentChange' => $percentChange,
                'leagueChanges' => $leagueChanges,
                'leagueHistories' => $best['leagueHistories'],
            ];
        }

        $result = array_values($bestByItemId);
        usort($result, fn(array $a, array $b): int => $b['percentChange'] <=> $a['percentChange']);

        return $result;
    }

    /**
     * The exact pinned/favorited items, resolved against the given leagues —
     * unlike getBestInvestmentsForWindow, every pin is included regardless of
     * volume, sign of change, or count: there's no threshold or top-N cutoff,
     * since a favorite is something the user explicitly chose to keep
     * watching. A pin with no data at all in the requested window still
     * appears, just with a null percentChange (rendered as "—"). A pin whose
     * item/pair isn't found in any of the given leagues is skipped entirely
     * (e.g. a stale favorite for an item that no longer exists).
     *
     * @param array<int, array{category: string, itemId: string, pairId: string}> $pins
     */
    public static function getInvestmentsForPins(
        array $leagues,
        array $pins,
        int $currentDayOfLeague,
        int $daysForward,
    ): array {
        $itemEntriesByLeagueId = [];
        foreach ($leagues as $league) {
            $byItemId = [];
            foreach ($league['itemEntries'] as $entry) {
                $byItemId[$entry['item']['id']] = $entry;
            }
            $itemEntriesByLeagueId[$league['id']] = $byItemId;
        }

        $results = [];

        foreach ($pins as $pin) {
            $item = null;
            $leagueChanges = [];
            $leagueHistories = [];

            foreach ($leagues as $league) {
                $entry = $itemEntriesByLeagueId[$league['id']][$pin['itemId']] ?? null;
                if ($entry === null) {
                    continue;
                }
                $item ??= $entry['item'];

                $pair = null;
                foreach ($entry['pairs'] as $candidate) {
                    if ($candidate['id'] === $pin['pairId']) {
                        $pair = $candidate;
                        break;
                    }
                }
                if ($pair === null) {
                    continue;
                }

                $leagueHistories[] = ['league' => $league, 'history' => $pair['history']];

                $rows = self::getAllHistoryRows($pair['history'], $league['startDate'], $currentDayOfLeague);
                $change = self::windowPercentChangeFromRows($rows, $currentDayOfLeague, $daysForward);
                if ($change !== null) {
                    $leagueChanges[] = ['league' => $league, 'percentChange' => $change];
                }
            }

            if ($item === null) {
                continue;
            }

            $results[] = [
                'item' => $item,
                'pairId' => $pin['pairId'],
                'percentChange' => self::average(array_map(fn(array $c): float => $c['percentChange'], $leagueChanges)),
                'leagueChanges' => $leagueChanges,
                'leagueHistories' => $leagueHistories,
            ];
        }

        return $results;
    }

    /**
     * Every pair one item trades against, across the given leagues, each
     * with its raw (unwindowed) per-league history plus its own windowed
     * percent change — used to offer the other pairs a best-investment/
     * favorite card's chart can switch to, with enough info (the percent
     * change) to show which of them actually did best over the current
     * window. Unlike getBestInvestmentsForWindow's ranking loop, this
     * doesn't filter by minVolume or require a positive change: it's just
     * "what data do we have", not "is this good enough to rank as a best
     * investment".
     */
    public static function getAllPairsForItem(
        array $leagues,
        string $itemId,
        int $currentDayOfLeague,
        int $daysForward,
    ): array {
        $pairIds = [];
        $entryByLeagueId = [];
        foreach ($leagues as $league) {
            foreach ($league['itemEntries'] as $entry) {
                if ($entry['item']['id'] !== $itemId) {
                    continue;
                }
                $entryByLeagueId[$league['id']] = $entry;
                foreach ($entry['pairs'] as $pair) {
                    if (!in_array($pair['id'], $pairIds, true)) {
                        $pairIds[] = $pair['id'];
                    }
                }
                break;
            }
        }

        $results = [];
        foreach ($pairIds as $pairId) {
            $leagueHistories = [];
            $changes = [];
            foreach ($leagues as $league) {
                $entry = $entryByLeagueId[$league['id']] ?? null;
                if ($entry === null) {
                    continue;
                }
                foreach ($entry['pairs'] as $pair) {
                    if ($pair['id'] === $pairId) {
                        $leagueHistories[] = ['league' => $league, 'history' => $pair['history']];

                        $rows = self::getAllHistoryRows($pair['history'], $league['startDate'], $currentDayOfLeague);
                        $change = self::windowPercentChangeFromRows($rows, $currentDayOfLeague, $daysForward);
                        if ($change !== null) {
                            $changes[] = $change;
                        }
                        break;
                    }
                }
            }
            $results[] = [
                'pairId' => $pairId,
                'percentChange' => self::average($changes),
                'leagueHistories' => $leagueHistories,
            ];
        }

        return $results;
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
