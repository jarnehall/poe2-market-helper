<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\Domain\MarketData;
use App\Http\JsonResponse;

// The single "give me the ranked cards" endpoint — 1:1 with the old
// getBestInvestmentsForWindow(...) call in MarketOverview.tsx. Returns each
// investment's leagueHistories trimmed to exactly the requested day window.
final class BestInvestmentsController
{
    /** @param array<int, array{id: string, name: string, color: string, folder: string}> $leagueConfigs */
    public function __construct(
        private readonly LeagueRepository $repository,
        private readonly array $leagueConfigs,
        private readonly array $bounds,
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

        JsonResponse::send([
            'investments' => array_map(
                fn(array $investment): array => $this->toPayload($investment, $leagues, $currentDayOfLeague, $daysBack, $daysForward),
                $investments,
            ),
        ]);
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
                    'rows' => $this->windowRows($leagueHistory['history'], $currentDayOfLeague, $daysBack, $daysForward),
                ],
                $investment['leagueHistories'],
            ),
        ];
    }

    private function windowRows(array $history, int $currentDayOfLeague, int $daysBack, int $daysForward): array
    {
        $allRows = MarketData::getAllHistoryRows($history, $currentDayOfLeague);
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
