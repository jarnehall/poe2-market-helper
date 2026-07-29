<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\Domain\MarketData;
use App\Http\JsonResponse;
use App\Http\QueryParams;

// The single "give me the ranked cards" endpoint — 1:1 with the old
// getBestInvestmentsForWindow(...) call in MarketOverview.tsx. Returns each
// investment's leagueHistories trimmed to exactly the requested day window.
final class BestInvestmentsController
{
    /**
     * @param array<int, array{id: string, name: string, color: string, folder: ?string, startDate?: string}> $leagueConfigs
     */
    public function __construct(
        private readonly LeagueRepository $repository,
        private readonly array $leagueConfigs,
        private readonly array $bounds,
        private readonly InvestmentPayloadBuilder $payloadBuilder,
    ) {
    }

    public function index(array $query): void
    {
        $leagueIds = QueryParams::splitParam($query['leagues'] ?? '');
        $categories = QueryParams::splitParam($query['categories'] ?? '');
        $pairCurrencies = QueryParams::splitParam($query['pairCurrencies'] ?? '');

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

        $currentDayOfLeague = QueryParams::clampInt(
            $query['currentDayOfLeague'] ?? null,
            $this->bounds['minDayOfLeague'],
            $this->bounds['maxDayOfLeague'],
        );
        $daysBack = QueryParams::clampInt(
            $query['daysBack'] ?? null,
            $this->bounds['minWindowDays'],
            min(
                $this->bounds['maxWindowDays'],
                max($this->bounds['minWindowDays'], $currentDayOfLeague - $this->bounds['minDayOfLeague']),
            ),
        );
        $daysForward = QueryParams::clampInt(
            $query['daysForward'] ?? null,
            $this->bounds['minWindowDays'],
            min(
                $this->bounds['maxWindowDays'],
                max($this->bounds['minWindowDays'], $this->bounds['maxDayOfLeague'] - $currentDayOfLeague),
            ),
        );
        $count = QueryParams::clampInt(
            $query['count'] ?? null,
            $this->bounds['minBestInvestmentCount'],
            $this->bounds['maxBestInvestmentCount'],
        );
        $minVolume = QueryParams::clampFloat(
            $query['minVolume'] ?? null,
            (float) $this->bounds['minVolumeFilter'],
            (float) $this->bounds['maxVolumeFilter'],
        );
        $useAveragePairs = QueryParams::bool($query['useAveragePairs'] ?? null);

        $leagues = $this->repository->loadFiltered($leagueIds, $categories, $pairCurrencies);
        $investments = MarketData::getBestInvestmentsForWindow(
            $leagues,
            $count,
            $currentDayOfLeague,
            $daysForward,
            $minVolume,
            $useAveragePairs,
        );

        $investments = $this->payloadBuilder->attachAlternatePairs($investments, $leagues, $currentDayOfLeague, $daysForward);

        $liveDataChecked = $this->payloadBuilder->shouldCheckLiveLeague($investments, $leagueIds);
        $investments = $this->payloadBuilder->augmentWithLiveLeague($investments, $leagueIds);

        JsonResponse::send([
            'investments' => array_map(
                fn(array $investment): array => $this->payloadBuilder->toPayload($investment, $leagues, $currentDayOfLeague, $daysBack, $daysForward),
                $investments,
            ),
            'poeNinjaStatus' => $this->payloadBuilder->poeNinjaStatus($liveDataChecked),
        ]);
    }
}
