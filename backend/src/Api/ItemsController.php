<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\Http\JsonResponse;

// Backs the favorites search box: the full item catalog (every league,
// every category), fetched once by the frontend and searched client-side —
// small enough that there's no need for a server-side query param or
// per-keystroke round trip.
final class ItemsController
{
    public function __construct(
        private readonly LeagueRepository $repository,
    ) {
    }

    public function index(): void
    {
        JsonResponse::send(['items' => $this->repository->listAllItems()]);
    }
}
