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
     * The current, still-running league (if selected) never participates in
     * ranking/pin-resolution itself — its data isn't in $leagues at all,
     * since it has no static data/ folder (see LeagueRepository). Instead,
     * for whichever items were already resolved, this fetches (or reads from
     * cache) that same item+pair's live data from poe.ninja and appends it as
     * an extra leagueHistories/leagueChanges entry, purely for display.
     */
    public function augmentWithLiveLeague(
        array $investments,
        array $leagueIds,
        int $currentDayOfLeague,
        int $daysBack,
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

        foreach ($investments as &$investment) {
            $liveEntry = $liveEntries[$investment['item']['detailsId']] ?? null;
            if ($liveEntry === null) {
                continue;
            }

            $livePair = null;
            foreach ($liveEntry['pairs'] as $candidate) {
                if ($candidate['id'] === $investment['pairId']) {
                    $livePair = $candidate;
                    break;
                }
            }
            if ($livePair === null) {
                continue;
            }

            $liveLeagueStub = ['id' => $liveLeagueId, 'startDate' => $this->currentLeagueInfo['startDate']];
            $investment['leagueHistories'][] = ['league' => $liveLeagueStub, 'history' => $livePair['history']];

            $change = MarketData::getWindowPercentChange(
                $livePair['history'],
                $this->currentLeagueInfo['startDate'],
                $currentDayOfLeague,
                $daysBack,
                $daysForward,
            );
            if ($change !== null) {
                $investment['leagueChanges'][] = ['league' => $liveLeagueStub, 'percentChange' => $change];
            }
        }
        unset($investment);

        return $investments;
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
            'leagueHistories' => array_map(
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
                $investment['leagueHistories'],
            ),
        ];
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
