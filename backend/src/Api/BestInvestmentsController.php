<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\DataAccess\PoeNinjaClient;
use App\Domain\MarketData;
use App\Http\JsonResponse;

// The single "give me the ranked cards" endpoint — 1:1 with the old
// getBestInvestmentsForWindow(...) call in MarketOverview.tsx. Returns each
// investment's leagueHistories trimmed to exactly the requested day window.
final class BestInvestmentsController
{
    /**
     * @param array<int, array{id: string, name: string, color: string, folder: ?string, startDate?: string}> $leagueConfigs
     * @param array{id?: string, name?: string, startDate?: string} $currentLeagueInfo
     */
    public function __construct(
        private readonly LeagueRepository $repository,
        private readonly array $leagueConfigs,
        private readonly array $bounds,
        private readonly PoeNinjaClient $poeNinjaClient,
        private readonly array $currentLeagueInfo,
    ) {
    }

    public function index(array $query): void
    {
        $leagueIds = $this->splitParam($query['leagues'] ?? '');
        $categories = $this->splitParam($query['categories'] ?? '');
        $pairCurrencies = $this->splitParam($query['pairCurrencies'] ?? '');

        if ($leagueIds === [] || $categories === [] || $pairCurrencies === []) {
            JsonResponse::send(['error' => 'leagues, categories, and pairCurrencies must each have at least one value'], 400);
        }

        $knownLeagueIds = $this->repository->leagueIds();
        foreach ($leagueIds as $leagueId) {
            if (!in_array($leagueId, $knownLeagueIds, true)) {
                JsonResponse::send(['error' => "Unknown league: {$leagueId}"], 400);
            }
        }

        $knownCategories = $this->repository->listCategories();
        foreach ($categories as $category) {
            if (!in_array($category, $knownCategories, true)) {
                JsonResponse::send(['error' => "Unknown category: {$category}"], 400);
            }
        }

        $currentDayOfLeague = $this->clampInt(
            $query['currentDayOfLeague'] ?? null,
            $this->bounds['minDayOfLeague'],
            $this->bounds['maxDayOfLeague'],
        );
        $daysBack = $this->clampInt(
            $query['daysBack'] ?? null,
            $this->bounds['minWindowDays'],
            max($this->bounds['minWindowDays'], $currentDayOfLeague - $this->bounds['minDayOfLeague']),
        );
        $daysForward = $this->clampInt(
            $query['daysForward'] ?? null,
            $this->bounds['minWindowDays'],
            max($this->bounds['minWindowDays'], $this->bounds['maxDayOfLeague'] - $currentDayOfLeague),
        );
        $count = $this->clampInt(
            $query['count'] ?? null,
            $this->bounds['minBestInvestmentCount'],
            $this->bounds['maxBestInvestmentCount'],
        );
        $minVolume = $this->clampFloat(
            $query['minVolume'] ?? null,
            (float) $this->bounds['minVolumeFilter'],
            (float) $this->bounds['maxVolumeFilter'],
        );

        $leagues = $this->repository->loadFiltered($leagueIds, $categories, $pairCurrencies);
        $investments = MarketData::getBestInvestmentsForWindow(
            $leagues,
            $count,
            $currentDayOfLeague,
            $daysBack,
            $daysForward,
            $minVolume,
        );

        $liveDataChecked = $this->shouldCheckLiveLeague($investments, $leagueIds);
        $investments = $this->augmentWithLiveLeague($investments, $leagueIds, $currentDayOfLeague, $daysBack, $daysForward);

        JsonResponse::send([
            'investments' => array_map(
                fn(array $investment): array => $this->toPayload($investment, $leagues, $currentDayOfLeague, $daysBack, $daysForward),
                $investments,
            ),
            'poeNinjaStatus' => [
                'checked' => $liveDataChecked,
                'attemptedCount' => $liveDataChecked ? $this->poeNinjaClient->getLastAttemptedCount() : 0,
                'failedItemIds' => $liveDataChecked ? $this->poeNinjaClient->getLastFailedItemIds() : [],
            ],
        ]);
    }

    /** Mirrors augmentWithLiveLeague's own early-return guard, computed before calling it so the response can report whether live data was even relevant this request. */
    private function shouldCheckLiveLeague(array $investments, array $leagueIds): bool
    {
        $liveLeagueId = $this->currentLeagueInfo['id'] ?? null;

        return $liveLeagueId !== null && $investments !== [] && in_array($liveLeagueId, $leagueIds, true);
    }

    /**
     * The current, still-running league (if selected) never participates in
     * ranking — its data isn't in $leagues at all, since it has no static
     * data/ folder (see LeagueRepository). Instead, for whichever items the
     * static leagues already ranked, this fetches (or reads from cache) that
     * same item+pair's live data from poe.ninja and appends it as an extra
     * leagueHistories/leagueChanges entry, purely for display — it never
     * affects $investment['percentChange'] (already computed above) or the
     * ranking/ordering itself.
     */
    private function augmentWithLiveLeague(
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

    private function toPayload(array $investment, array $leagues, int $currentDayOfLeague, int $daysBack, int $daysForward): array
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

    private function splitParam(mixed $value): array
    {
        if (!is_string($value)) {
            return [];
        }

        $value = trim($value);
        if ($value === '') {
            return [];
        }

        return array_values(array_filter(
            array_map('trim', explode(',', $value)),
            fn(string $v): bool => $v !== '',
        ));
    }

    private function clampInt(mixed $value, int $min, int $max): int
    {
        $n = is_string($value) && $value !== '' ? (int) $value : $min;

        return max($min, min($max, $n));
    }

    private function clampFloat(mixed $value, float $min, float $max): float
    {
        $n = is_string($value) && $value !== '' ? (float) $value : $min;

        return max($min, min($max, $n));
    }
}
