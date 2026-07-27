<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\Http\JsonResponse;

// Fetched once on page load — everything the frontend needs to render the
// filter UI itself and seed its defaults, before it can make any
// best-investments request.
final class MetaController
{
    /** @param array<int, array{id: string, name: string, color: string, folder: string}> $leagueConfigs */
    public function __construct(
        private readonly LeagueRepository $repository,
        private readonly array $leagueConfigs,
        private readonly array $bounds,
    ) {
    }

    public function index(): void
    {
        $leagues = array_map(
            fn(array $config): array => ['id' => $config['id'], 'name' => $config['name'], 'color' => $config['color']],
            $this->leagueConfigs,
        );

        JsonResponse::send([
            'currentLeague' => $this->repository->currentLeagueInfo(),
            'leagues' => $leagues,
            'categories' => $this->repository->listCategories(),
            'pairCurrencies' => $this->repository->listPairCurrencies(),
            'bounds' => $this->bounds,
        ]);
    }
}
