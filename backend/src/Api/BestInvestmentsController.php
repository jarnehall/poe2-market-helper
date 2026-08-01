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
        // Absent (or any value other than '1'/'true') means false — the
        // app's own actual default is the *weighted* ranking below, not the
        // plain average this flag is named for; see MarketData::
        // getRankedInvestments' own doc comment for what each mode means.
        $usePureAverages = QueryParams::bool($query['usePureAverages'] ?? null);

        $leagues = $this->repository->loadFiltered($leagueIds, $categories, $pairCurrencies);

        // Recency-based defaults (see MarketData::defaultLeagueWeights) as
        // a baseline, with the frontend's own explicit weight substituted
        // in for whichever of *these* leagues it actually sent one for —
        // covers both a request that omits leagueWeights entirely (mirrors
        // the frontend's own default slider positions) and one that's
        // missing an entry for a league the user just added to their
        // selection (the frontend only knows to send weights for leagues it
        // already had sliders for).
        $leagueWeights = MarketData::defaultLeagueWeights($leagues);
        foreach (QueryParams::parseWeightMap($query['leagueWeights'] ?? '') as $leagueId => $weight) {
            if (isset($leagueWeights[$leagueId])) {
                $leagueWeights[$leagueId] = $weight;
            }
        }

        // Every qualifying investment, not just the top $count — so an item
        // dropped for having no live-league poe.ninja data (see
        // resolveRankedInvestments) can be backfilled from the rest of the
        // ranked pool instead of just shrinking the response below $count.
        $rankedPool = MarketData::getRankedInvestments(
            $leagues,
            $currentDayOfLeague,
            $daysForward,
            $minVolume,
            $useAveragePairs,
            $usePureAverages,
            $leagueWeights,
        );

        $resolved = $this->payloadBuilder->resolveRankedInvestments(
            $rankedPool,
            $count,
            $leagues,
            $leagueIds,
            $currentDayOfLeague,
            $daysForward,
        );

        JsonResponse::send([
            'investments' => array_map(
                fn(array $investment): array => $this->payloadBuilder->toPayload($investment, $leagues, $currentDayOfLeague, $daysBack, $daysForward),
                $resolved['investments'],
            ),
            'poeNinjaStatus' => $resolved['poeNinjaStatus'],
            // Lets the frontend tell "nothing qualifies right now" apart
            // from "there's no data at all for this day/league selection"
            // (e.g. a static league whose snapshot doesn't reach this far
            // back/forward) — the two need different empty-state messaging.
            // Only meaningful (and only worth computing) when the response
            // is actually empty; true is otherwise the safe default so a
            // non-empty response never claims there's no data.
            'hasDataInWindow' => $resolved['investments'] !== []
                || MarketData::hasDataInWindow($leagues, $currentDayOfLeague, $daysForward),
        ]);
    }
}
