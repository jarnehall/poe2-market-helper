<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\PoeNinjaClient;
use App\Domain\MarketData;

// Shared by BestInvestmentsController and FavoritesController — both end up
// with the same shape of "investments" (item/pairId/percentChange/
// leagueChanges/leagueHistories) and need the exact same live-league overlay
// and JSON payload shaping, they just get there via a different ranking/pin
// resolution step.
final class InvestmentPayloadBuilder
{
    /** @param array{id?: string, name?: string, startDate?: string} $currentLeagueInfo */
    public function __construct(
        private readonly PoeNinjaClient $poeNinjaClient,
        private readonly array $currentLeagueInfo,
    ) {
    }

    /** Mirrors augmentWithLiveLeague's own early-return guard, computed before calling it so the response can report whether live data was even relevant this request. */
    public function shouldCheckLiveLeague(array $investments, array $leagueIds): bool
    {
        $liveLeagueId = $this->currentLeagueInfo['id'] ?? null;

        return $liveLeagueId !== null && $investments !== [] && in_array($liveLeagueId, $leagueIds, true);
    }

    /**
     * Attaches every pair each investment's item has data for (per
     * MarketData::getAllPairsForItem), alongside its already-resolved
     * "best"/pinned pair — lets the frontend offer buttons to switch a
     * card's chart to a different pair without a refetch, each labeled with
     * its own windowed percent change so it's clear at a glance which pair
     * actually did best over the current window. Must run before
     * augmentWithLiveLeague, so the live-league overlay below can also apply
     * to these alternate pairs, not just the main one.
     */
    public function attachAlternatePairs(
        array $investments,
        array $leagues,
        int $currentDayOfLeague,
        int $daysForward,
    ): array {
        foreach ($investments as &$investment) {
            $investment['pairs'] = MarketData::getAllPairsForItem(
                $leagues,
                $investment['item']['id'],
                $currentDayOfLeague,
                $daysForward,
            );
        }
        unset($investment);

        return $investments;
    }

    /**
     * The current, still-running league (if selected) never participates in
     * ranking/pin-resolution itself — its data isn't in $leagues at all,
     * since it has no static data/ folder (see LeagueRepository). Instead,
     * for whichever items were already resolved, this fetches (or reads from
     * cache) that same item's live data from poe.ninja and appends each pair
     * an extra leagueHistories entry, purely for display as an overlay line
     * on the chart. Deliberately NOT added to leagueChanges (the per-league
     * percent-change breakdown shown next to the card's main number) — the
     * live league was never actually selected, so its own "growth" isn't a
     * meaningful data point there, only the leagues the user picked are
     * (except for a promoted pair — see below — which needs its own
     * breakdown recomputed from scratch anyway).
     *
     * A pair with no *meaningful* live-league data (poe.ninja has nothing
     * for it at all, or nothing but zero-volume placeholder rows — it
     * returns a row like rate: 1, volumePrimaryValue: 0 for a pair with no
     * real trades yet, rather than omitting it) is dropped from $pairs
     * entirely: the live league was explicitly selected, so offering a
     * pair-switcher option that can't show it isn't useful. If that
     * happens to be the ranked/pinned pair itself, the best remaining pair
     * that *does* have real live data is promoted to take its place
     * (recomputing percentChange/leagueChanges for it, since an alternate
     * pair doesn't carry those — see attachAlternatePairs) rather than
     * dropping the whole card over one pair's gap. Only when *no* pair has
     * real live data does the item get dropped entirely. Applies to a
     * pinned favorite too, not just ranked cards — same shared method,
     * same rule either way.
     */
    public function augmentWithLiveLeague(
        array $investments,
        array $leagueIds,
        int $currentDayOfLeague,
        int $daysForward,
    ): array {
        $liveLeagueId = $this->currentLeagueInfo['id'] ?? null;
        if ($liveLeagueId === null || $investments === [] || !in_array($liveLeagueId, $leagueIds, true)) {
            return $investments;
        }

        // poe.ninja's `id` query param is the item's *details* slug (e.g.
        // "armourers-scrap", "chaos-orb"), not our own internal item.id
        // (e.g. "scrap", "chaos") — those two only coincide for some items,
        // which is why this used to silently work for some cards and 404
        // for others that happen to have a short internal id.
        $neededItems = array_map(
            fn(array $investment): array => [
                'itemId' => $investment['item']['detailsId'],
                'category' => $investment['item']['category'],
            ],
            $investments,
        );
        $liveEntries = $this->poeNinjaClient->getEntries($neededItems);
        $liveLeagueStub = ['id' => $liveLeagueId, 'startDate' => $this->currentLeagueInfo['startDate']];

        // Rebuilt into a fresh, re-indexed array (rather than unset()-ing in
        // place) so a dropped item can never leave a gap in the numeric keys
        // — array_map (see both callers) preserves keys, and a non-sequential
        // array serializes as a JSON object instead of an array, which the
        // frontend doesn't expect.
        $result = [];

        foreach ($investments as $investment) {
            $liveEntry = $liveEntries[$investment['item']['detailsId']] ?? null;
            if ($liveEntry === null) {
                continue;
            }

            // How recent a pair's own latest real trade needs to be to still
            // count as "has real live data" — the freshest date poe.ninja
            // reported *any* real trade on, across every pair of this item.
            // A pair whose own latest real row falls short of that (e.g. it
            // last traded yesterday while a sibling pair traded today) is
            // treated the same as having no real data at all: keeping it as
            // the ranked/pinned pair would silently show stale data next to
            // a "current league" label, even though it did have real trades
            // once. Comparing against the whole item's own freshest date —
            // not literally "today" — avoids false negatives right after
            // league launch or during a lull when poe.ninja hasn't posted
            // *any* pair's latest day yet.
            $asOfTimestamp = self::latestHistoryTimestamp($liveEntry['pairs']);

            // The ranked/pinned pair is checked directly against $liveEntry
            // (not just via $investment['pairs']) — attachAlternatePairs can
            // legitimately come back empty (e.g. the item isn't in any of
            // the selected static leagues, only pinned) while the ranked
            // pair itself still has perfectly good live data, and that must
            // not be misread as "nothing has real data".
            $mainLivePair = self::findPairById($liveEntry['pairs'], $investment['pairId']);
            $mainHasRealData = $mainLivePair !== null && self::hasRealTradeData($mainLivePair['history'], $asOfTimestamp);

            // Only pairs with real live-league data are worth offering via
            // the switcher once the live league is selected — poe.ninja
            // still returns a pair with just a zero-volume placeholder row
            // for one with no real trades yet, rather than omitting it.
            $pairsWithLiveData = [];
            foreach ($investment['pairs'] ?? [] as $pair) {
                $livePair = self::findPairById($liveEntry['pairs'], $pair['pairId']);
                if ($livePair === null || !self::hasRealTradeData($livePair['history'], $asOfTimestamp)) {
                    continue;
                }
                $pair['leagueHistories'][] = ['league' => $liveLeagueStub, 'history' => $livePair['history']];
                $pairsWithLiveData[] = $pair;
            }

            if ($mainHasRealData) {
                $investment['leagueHistories'][] = ['league' => $liveLeagueStub, 'history' => $mainLivePair['history']];
            } elseif ($pairsWithLiveData !== []) {
                // The ranked/pinned pair itself has no real live data, but
                // at least one alternate does — promote the best-performing
                // of those to be the new main pair instead of dropping the
                // card. Recomputes percentChange/leagueChanges from scratch,
                // since an alternate pair doesn't carry those (see
                // attachAlternatePairs) the way the ranked pair does.
                $promoted = $pairsWithLiveData[0];
                foreach ($pairsWithLiveData as $candidate) {
                    if (($candidate['percentChange'] ?? -INF) > ($promoted['percentChange'] ?? -INF)) {
                        $promoted = $candidate;
                    }
                }

                $investment['pairId'] = $promoted['pairId'];
                $investment['percentChange'] = $promoted['percentChange'];
                $investment['leagueHistories'] = $promoted['leagueHistories'];
                $investment['leagueChanges'] = [];
                foreach ($promoted['leagueHistories'] as $entry) {
                    if ($entry['league']['id'] === $liveLeagueId) {
                        continue;
                    }
                    $change = MarketData::getWindowPercentChange(
                        $entry['history'],
                        $entry['league']['startDate'],
                        $currentDayOfLeague,
                        $daysForward,
                    );
                    if ($change !== null) {
                        $investment['leagueChanges'][] = ['league' => $entry['league'], 'percentChange' => $change];
                    }
                }
            } else {
                // Not even one pair (ranked or alternate) has real live-
                // league data for this item — drop it entirely, same as a
                // fully-missing poe.ninja entry.
                continue;
            }

            if (isset($investment['pairs'])) {
                $investment['pairs'] = $pairsWithLiveData;
            }
            $result[] = $investment;
        }

        return $result;
    }

    /**
     * A pair with no rows at all, nothing but poe.ninja's zero-volume "no
     * real trades yet" placeholder, or nothing at $asOfTimestamp (its own
     * latest real trade lags behind a sibling pair's — see
     * latestHistoryTimestamp) isn't meaningfully different from having no
     * data at all. $asOfTimestamp is null only when no pair of this item has
     * any row whatsoever, in which case every row is checked regardless of
     * date (there's nothing fresher to compare against).
     */
    private static function hasRealTradeData(array $history, ?string $asOfTimestamp): bool
    {
        foreach ($history as $row) {
            if ($asOfTimestamp !== null && ($row['timestamp'] ?? null) !== $asOfTimestamp) {
                continue;
            }
            if (($row['volumePrimaryValue'] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * The most recent timestamp any pair of this item has a history row
     * for — poe.ninja's ISO 8601 UTC timestamps sort correctly as plain
     * strings, so no date parsing is needed. Null only when every pair's
     * history is completely empty.
     */
    private static function latestHistoryTimestamp(array $pairs): ?string
    {
        $latest = null;
        foreach ($pairs as $pair) {
            foreach ($pair['history'] as $row) {
                $timestamp = $row['timestamp'] ?? null;
                if ($timestamp !== null && ($latest === null || $timestamp > $latest)) {
                    $latest = $timestamp;
                }
            }
        }

        return $latest;
    }

    /**
     * BestInvestmentsController's own entry point: resolves the final $count
     * cards for a ranked request from $rankedPool (see
     * MarketData::getRankedInvestments, already sorted best-first), keeping
     * the response's count intact even when some items get dropped for
     * having no live-league poe.ninja data (see augmentWithLiveLeague) — the
     * next-best candidate(s) from the pool backfill each drop, in a batch
     * just large enough to cover however many were just dropped, repeating
     * until either $count survive or the pool runs out. When the live
     * league isn't even relevant to this request (see
     * shouldCheckLiveLeague), the very first batch already IS the final
     * $count with nothing to drop, so this costs exactly one iteration —
     * same as calling augmentWithLiveLeague directly once.
     *
     * Also accumulates poe.ninja's attempted/failed-item counts across every
     * batch actually checked: PoeNinjaClient::getEntries resets its own
     * counters on every call, so reading them only after the *last* batch
     * (as a single augmentWithLiveLeague call's caller normally would) would
     * silently under-report every earlier batch's own fetches.
     *
     * @return array{investments: array, poeNinjaStatus: array{checked: bool, attemptedCount: int, failedItemIds: array<int, string>, failedItems: array<int, array{itemId: string, itemName: string, url: string}>}}
     */
    public function resolveRankedInvestments(
        array $rankedPool,
        int $count,
        array $leagues,
        array $leagueIds,
        int $currentDayOfLeague,
        int $daysForward,
    ): array {
        $checked = $this->shouldCheckLiveLeague($rankedPool, $leagueIds);

        $investments = [];
        $attemptedTotal = 0;
        $failedIdsTotal = [];
        $failedItemsTotal = [];
        $offset = 0;

        while (count($investments) < $count && $offset < count($rankedPool)) {
            $batch = array_slice($rankedPool, $offset, $count - count($investments));
            if ($batch === []) {
                break;
            }
            $offset += count($batch);

            // Kept around (pre-drop) so failedItemDetails() below can still
            // look up a dropped item's own name/id — augmentWithLiveLeague's
            // own return value no longer has it.
            $preDropBatch = $this->attachAlternatePairs($batch, $leagues, $currentDayOfLeague, $daysForward);
            $survivedBatch = $this->augmentWithLiveLeague($preDropBatch, $leagueIds, $currentDayOfLeague, $daysForward);

            // $rankedPool only contains items whose *original* (pre-
            // promotion) pair was a real gain (see MarketData::
            // getRankedInvestments' own percentChange > 0 qualifier), but a
            // promoted pair (see augmentWithLiveLeague) carries a freshly
            // recomputed percentChange of its own, which can come out <= 0.
            // A promoted-to-a-loss investment doesn't belong in "best
            // investments" any more than one whose original pair was a loss,
            // so it's dropped here and backfilled from the pool exactly like
            // a live-league-data drop.
            $survivedBatch = array_values(array_filter(
                $survivedBatch,
                fn(array $investment): bool => ($investment['percentChange'] ?? 0) > 0,
            ));

            if ($checked) {
                $attemptedTotal += $this->poeNinjaClient->getLastAttemptedCount();
                $failedIdsTotal = [...$failedIdsTotal, ...$this->poeNinjaClient->getLastFailedItemIds()];
                $failedItemsTotal = [...$failedItemsTotal, ...$this->failedItemDetails($preDropBatch)];
            }

            $investments = [...$investments, ...$survivedBatch];
        }

        // A promoted pair's recomputed percentChange can differ meaningfully
        // from the original (pre-promotion) value $rankedPool was sorted by,
        // so the final list is re-sorted here to keep "best investments"
        // actually best-first despite any mid-list promotions.
        usort($investments, fn(array $a, array $b): int => $b['percentChange'] <=> $a['percentChange']);

        return [
            'investments' => $investments,
            'poeNinjaStatus' => [
                'checked' => $checked,
                'attemptedCount' => $attemptedTotal,
                'failedItemIds' => $failedIdsTotal,
                'failedItems' => $failedItemsTotal,
            ],
        ];
    }

    /**
     * Cross-references the last augmentWithLiveLeague call's failed item ids
     * (see PoeNinjaClient::getLastFailedItemIds/getLastFailedItemUrls)
     * against $investments to attach each failure's item name and the exact
     * poe.ninja URL that failed — enough to show *what* didn't work
     * (e.g. in a status tooltip), not just how many. $investments must be
     * the same batch (pre-drop) augmentWithLiveLeague was just called with:
     * a dropped item's name isn't recoverable from that call's own result,
     * since dropping is the whole point of augmentWithLiveLeague.
     *
     * @return array<int, array{itemId: string, itemName: string, url: string}>
     */
    private function failedItemDetails(array $investments): array
    {
        $failedIds = $this->poeNinjaClient->getLastFailedItemIds();
        if ($failedIds === []) {
            return [];
        }

        $urls = $this->poeNinjaClient->getLastFailedItemUrls();
        $details = [];

        foreach ($investments as $investment) {
            $detailsId = $investment['item']['detailsId'];
            if (in_array($detailsId, $failedIds, true)) {
                $details[] = [
                    'itemId' => $detailsId,
                    'itemName' => $investment['item']['name'],
                    'url' => $urls[$detailsId] ?? '',
                ];
            }
        }

        return $details;
    }

    private static function findPairById(array $pairs, string $pairId): ?array
    {
        foreach ($pairs as $pair) {
            if ($pair['id'] === $pairId) {
                return $pair;
            }
        }

        return null;
    }

    public function toPayload(array $investment, array $leagues, int $currentDayOfLeague, int $daysBack, int $daysForward): array
    {
        return [
            'item' => $investment['item'],
            'pairId' => $investment['pairId'],
            // Only present for a pinned favorite (see MarketData::
            // getInvestmentsForPins) — the exact pairId the pin was
            // requested with, which can differ from 'pairId' above once
            // augmentWithLiveLeague promotes a different pair. Lets the
            // frontend match this result back to its pin without assuming
            // the two pairIds stay equal.
            'pinPairId' => $investment['pinPairId'] ?? null,
            'pairName' => MarketData::getPairDisplayName($investment['pairId'], $leagues),
            'pairImage' => MarketData::getPairImage($investment['pairId'], $leagues),
            'percentChange' => $investment['percentChange'],
            'leagueChanges' => array_map(
                fn(array $change): array => ['leagueId' => $change['league']['id'], 'percentChange' => $change['percentChange']],
                $investment['leagueChanges'],
            ),
            'leagueHistories' => $this->windowedLeagueHistories(
                $investment['leagueHistories'],
                $currentDayOfLeague,
                $daysBack,
                $daysForward,
            ),
            // Every pair this item has data for (see attachAlternatePairs) —
            // lets the frontend switch a card's chart between them without a
            // refetch, each with its own windowed percentChange so the
            // switcher buttons can show which pair actually improved most.
            // No per-league leagueChanges breakdown here, unlike the ranked/
            // pinned pair above — that breakdown is specifically about which
            // *leagues* agree, not relevant to "which pair is this".
            'pairs' => array_map(
                fn(array $pair): array => [
                    'pairId' => $pair['pairId'],
                    'pairName' => MarketData::getPairDisplayName($pair['pairId'], $leagues),
                    'pairImage' => MarketData::getPairImage($pair['pairId'], $leagues),
                    'percentChange' => $pair['percentChange'],
                    'leagueHistories' => $this->windowedLeagueHistories(
                        $pair['leagueHistories'],
                        $currentDayOfLeague,
                        $daysBack,
                        $daysForward,
                    ),
                ],
                $investment['pairs'] ?? [],
            ),
        ];
    }

    private function windowedLeagueHistories(array $leagueHistories, int $currentDayOfLeague, int $daysBack, int $daysForward): array
    {
        return array_map(
            fn(array $leagueHistory): array => [
                'leagueId' => $leagueHistory['league']['id'],
                'rows' => $this->windowRows(
                    $leagueHistory['history'],
                    $leagueHistory['league']['startDate'],
                    $currentDayOfLeague,
                    $daysBack,
                    $daysForward,
                ),
            ],
            $leagueHistories,
        );
    }

    /** @param array $investments the same (pre-drop) batch just passed to augmentWithLiveLeague — see failedItemDetails() */
    public function poeNinjaStatus(bool $checked, array $investments = []): array
    {
        return [
            'checked' => $checked,
            'attemptedCount' => $checked ? $this->poeNinjaClient->getLastAttemptedCount() : 0,
            'failedItemIds' => $checked ? $this->poeNinjaClient->getLastFailedItemIds() : [],
            'failedItems' => $checked ? $this->failedItemDetails($investments) : [],
        ];
    }

    private function windowRows(array $history, string $startDate, int $currentDayOfLeague, int $daysBack, int $daysForward): array
    {
        $allRows = MarketData::getAllHistoryRows($history, $startDate, $currentDayOfLeague);
        $windowRows = MarketData::getHistoryRowsInWindow($allRows, $daysBack, $daysForward, $currentDayOfLeague);

        return array_map(fn(array $row): array => [
            'timestamp' => $row['entry']['timestamp'],
            'rate' => $row['entry']['rate'],
            'volumePrimaryValue' => $row['entry']['volumePrimaryValue'],
            'dayOfLeague' => $row['dayOfLeague'],
            'percentChange' => $row['percentChange'],
        ], $windowRows);
    }
}
