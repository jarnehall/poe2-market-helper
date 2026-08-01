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
     * cache) that same item+pair's live data from poe.ninja and appends it as
     * an extra leagueHistories entry, purely for display as an overlay line
     * on the chart. Deliberately NOT added to leagueChanges (the per-league
     * percent-change breakdown shown next to the card's main number) — the
     * live league was never actually selected, so its own "growth" isn't a
     * meaningful data point there, only the leagues the user picked are.
     *
     * An item poe.ninja has no live-league data for at all (a genuine "not
     * traded yet", or a fetch failure — see PoeNinjaClient, both come back
     * as a null entry here) is dropped from the result entirely, rather than
     * shown with the live league's overlay silently missing: the live league
     * was explicitly selected, so a card that can't show it isn't a useful
     * answer to what was asked for. This applies to a pinned favorite too,
     * not just ranked cards — same shared method, same rule either way.
     */
    public function augmentWithLiveLeague(array $investments, array $leagueIds): array
    {
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

            $liveLeagueStub = ['id' => $liveLeagueId, 'startDate' => $this->currentLeagueInfo['startDate']];

            $livePair = self::findPairById($liveEntry['pairs'], $investment['pairId']);
            if ($livePair !== null) {
                $investment['leagueHistories'][] = ['league' => $liveLeagueStub, 'history' => $livePair['history']];
            }

            // Same overlay, applied to every alternate pair too (see
            // attachAlternatePairs) — otherwise switching a card's chart to
            // another pair while the live league is selected would silently
            // drop that overlay line for it. Bound to a real reference
            // variable first — `foreach ($investment['pairs'] ?? [] as &$x)`
            // would iterate a disconnected copy, since `??` produces a new
            // value rather than an alias to the original array, silently
            // discarding every mutation made through `&$x`.
            if (isset($investment['pairs'])) {
                $pairs = &$investment['pairs'];
                foreach ($pairs as &$altPair) {
                    $altLivePair = self::findPairById($liveEntry['pairs'], $altPair['pairId']);
                    if ($altLivePair !== null) {
                        $altPair['leagueHistories'][] = ['league' => $liveLeagueStub, 'history' => $altLivePair['history']];
                    }
                }
                unset($altPair, $pairs);
            }

            $result[] = $investment;
        }

        return $result;
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
     * @return array{investments: array, poeNinjaStatus: array{checked: bool, attemptedCount: int, failedItemIds: array<int, string>}}
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
        $offset = 0;

        while (count($investments) < $count && $offset < count($rankedPool)) {
            $batch = array_slice($rankedPool, $offset, $count - count($investments));
            if ($batch === []) {
                break;
            }
            $offset += count($batch);

            $batch = $this->attachAlternatePairs($batch, $leagues, $currentDayOfLeague, $daysForward);
            $batch = $this->augmentWithLiveLeague($batch, $leagueIds);

            if ($checked) {
                $attemptedTotal += $this->poeNinjaClient->getLastAttemptedCount();
                $failedIdsTotal = [...$failedIdsTotal, ...$this->poeNinjaClient->getLastFailedItemIds()];
            }

            $investments = [...$investments, ...$batch];
        }

        return [
            'investments' => $investments,
            'poeNinjaStatus' => [
                'checked' => $checked,
                'attemptedCount' => $attemptedTotal,
                'failedItemIds' => $failedIdsTotal,
            ],
        ];
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

    public function poeNinjaStatus(bool $checked): array
    {
        return [
            'checked' => $checked,
            'attemptedCount' => $checked ? $this->poeNinjaClient->getLastAttemptedCount() : 0,
            'failedItemIds' => $checked ? $this->poeNinjaClient->getLastFailedItemIds() : [],
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
