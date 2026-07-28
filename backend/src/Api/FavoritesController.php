<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\Domain\MarketData;
use App\Http\JsonResponse;
use App\Http\QueryParams;

// The "give me the cards for whatever the user pinned" endpoint — same
// response shape as BestInvestmentsController, but keyed to an exact list of
// (category, itemId, pairId) pins instead of a ranked/filtered selection.
// Pins are never excluded by category/pairCurrency selection or by any
// ranking threshold (volume, sign of change, count) — a favorite is always
// shown; only the day window and league selection affect its trend chart.
final class FavoritesController
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

        if ($leagueIds === []) {
            JsonResponse::send(['error' => 'leagues must have at least one value'], 400);
        }

        $knownLeagueIds = $this->repository->leagueIds();
        foreach ($leagueIds as $leagueId) {
            if (!in_array($leagueId, $knownLeagueIds, true)) {
                JsonResponse::send(['error' => "Unknown league: {$leagueId}"], 400);
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
            max($this->bounds['minWindowDays'], $currentDayOfLeague - $this->bounds['minDayOfLeague']),
        );
        $daysForward = QueryParams::clampInt(
            $query['daysForward'] ?? null,
            $this->bounds['minWindowDays'],
            max($this->bounds['minWindowDays'], $this->bounds['maxDayOfLeague'] - $currentDayOfLeague),
        );

        $pins = $this->parsePins($query['pins'] ?? '');

        if ($pins === []) {
            JsonResponse::send([
                'investments' => [],
                'poeNinjaStatus' => ['checked' => false, 'attemptedCount' => 0, 'failedItemIds' => []],
            ]);
        }

        $leagues = $this->repository->loadPinned($leagueIds, $pins);
        $investments = MarketData::getInvestmentsForPins($leagues, $pins, $currentDayOfLeague, $daysBack, $daysForward);

        $liveDataChecked = $this->payloadBuilder->shouldCheckLiveLeague($investments, $leagueIds);
        $investments = $this->payloadBuilder->augmentWithLiveLeague($investments, $leagueIds, $currentDayOfLeague, $daysBack, $daysForward);

        JsonResponse::send([
            'investments' => array_map(
                fn(array $investment): array => $this->payloadBuilder->toPayload($investment, $leagues, $currentDayOfLeague, $daysBack, $daysForward),
                $investments,
            ),
            'poeNinjaStatus' => $this->payloadBuilder->poeNinjaStatus($liveDataChecked),
        ]);
    }

    /**
     * Decodes the `pins` JSON param and drops anything malformed or for an
     * unknown category, rather than 400ing the whole request — the pin list
     * comes from the client's own localStorage, which could in principle
     * hold a stale entry (e.g. from a category that no longer exists).
     *
     * @return array<int, array{category: string, itemId: string, pairId: string}>
     */
    private function parsePins(mixed $raw): array
    {
        if (!is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $knownCategories = $this->repository->listCategories();
        $pins = [];

        foreach ($decoded as $pin) {
            if (
                !is_array($pin)
                || !isset($pin['category'], $pin['itemId'], $pin['pairId'])
                || !is_string($pin['category']) || !is_string($pin['itemId']) || !is_string($pin['pairId'])
                || !in_array($pin['category'], $knownCategories, true)
            ) {
                continue;
            }

            $pins[] = ['category' => $pin['category'], 'itemId' => $pin['itemId'], 'pairId' => $pin['pairId']];
        }

        return $pins;
    }
}
