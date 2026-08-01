<?php

declare(strict_types=1);

namespace App\Api;

use App\Http\JsonResponse;

// The one endpoint that isn't scoped to a single `game` — the frontend's
// "/" route uses this to redirect to whichever game's current league
// started most recently, which means comparing both games' startDates
// before either one has been chosen. Deliberately not MetaController: that
// records a visit as a side effect, and fetching it for both games just to
// read startDate would double-count a single page load.
final class CurrentLeaguesController
{
    public function __construct(
        private readonly string $repoRoot,
    ) {
    }

    public function index(): void
    {
        JsonResponse::send([
            'poe1' => $this->readCurrentLeague('poe1'),
            'poe2' => $this->readCurrentLeague('poe2'),
        ]);
    }

    /** @return array{id: string, name: string, color: string, startDate: string} */
    private function readCurrentLeague(string $game): array
    {
        $path = $this->repoRoot . '/data/' . $game . '/current-league.json';

        return json_decode(file_get_contents($path), true);
    }
}
