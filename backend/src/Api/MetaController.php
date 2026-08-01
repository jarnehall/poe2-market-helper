<?php

declare(strict_types=1);

namespace App\Api;

use App\DataAccess\LeagueRepository;
use App\DataAccess\VisitorTracker;
use App\Http\JsonResponse;

// Fetched once on page load — everything the frontend needs to render the
// filter UI itself and seed its defaults, before it can make any
// best-investments request. Also the one place a visit gets recorded (see
// VisitorTracker) — best-investments is called repeatedly per filter
// change within the same page load, so recording there would overcount.
final class MetaController
{
    /** @param array<int, array{id: string, name: string, color: string, folder: string}> $leagueConfigs */
    public function __construct(
        private readonly LeagueRepository $repository,
        private readonly array $leagueConfigs,
        private readonly array $bounds,
        private readonly VisitorTracker $visitorTracker,
    ) {
    }

    /** @param array<string, mixed> $server $_SERVER, passed in rather than read directly so this stays testable */
    public function index(array $server): void
    {
        $currentLeagueInfo = $this->repository->currentLeagueInfo();
        $visitorCount = $this->visitorTracker->recordVisitAndCount(self::clientIp($server));

        // poe.ninja's own economy-page URL slug for the live league isn't
        // always its display name lowercased (e.g. POE1's "Curse of the
        // Allflame" is poe.ninja's "allflame") — same mismatch, and the same
        // leagues.php 'poeNinjaLeague' override, as public/index.php already
        // needs for its own poe.ninja API calls. The frontend builds poe.ninja
        // *links* itself (see src/lib/marketData.ts's getPoeNinjaUrl), so it
        // needs this slug too rather than deriving one from the display name.
        $currentLeagueConfig = null;
        foreach ($this->leagueConfigs as $config) {
            if ($config['id'] === ($currentLeagueInfo['id'] ?? null)) {
                $currentLeagueConfig = $config;
                break;
            }
        }
        $currentLeagueInfo['poeNinjaLeague'] =
            $currentLeagueConfig['poeNinjaLeague'] ?? ($currentLeagueInfo['name'] ?? $currentLeagueConfig['name'] ?? '');

        // data/<game>/current-league.json is the one meant to be updated
        // each time the current league changes, so its id/name/color win
        // over the static leagues.php entry for whichever league matches it.
        // isLive flags the league with no static data/ folder (fetched from
        // poe.ninja instead) — it never contributes to best-investments
        // ranking, so the frontend needs this to pick a sane default league
        // selection (one that will actually show results) rather than
        // always defaulting to leagues[0].
        // startDate lets the frontend sort leagues by recency (see the
        // recency-weighted ranking sliders in FiltersContext.tsx) without
        // needing its own copy of leagues.php — the live league's own
        // config entry has no 'startDate' at all (see leagues.php's own
        // comment on why), so current-league.json's is the only source for
        // it, same as name/color above.
        $leagues = array_map(function (array $config) use ($currentLeagueInfo): array {
            $isLive = $config['folder'] === null;
            if ($config['id'] === ($currentLeagueInfo['id'] ?? null)) {
                return [
                    'id' => $config['id'],
                    'name' => $currentLeagueInfo['name'] ?? $config['name'],
                    'color' => $currentLeagueInfo['color'] ?? $config['color'],
                    'startDate' => $currentLeagueInfo['startDate'] ?? $config['startDate'] ?? null,
                    'isLive' => $isLive,
                ];
            }

            return [
                'id' => $config['id'],
                'name' => $config['name'],
                'color' => $config['color'],
                'startDate' => $config['startDate'] ?? null,
                'isLive' => $isLive,
            ];
        }, $this->leagueConfigs);

        JsonResponse::send([
            'currentLeague' => $currentLeagueInfo,
            'leagues' => $leagues,
            'categories' => $this->repository->listCategories(),
            'pairCurrencies' => $this->repository->listPairCurrencies(),
            'bounds' => $this->bounds,
            'visitorCount' => $visitorCount,
        ]);
    }

    /** Prefers X-Forwarded-For's first hop (this app may sit behind a reverse proxy) over REMOTE_ADDR. */
    private static function clientIp(array $server): string
    {
        $forwardedFor = $server['HTTP_X_FORWARDED_FOR'] ?? null;
        if (is_string($forwardedFor) && $forwardedFor !== '') {
            return trim(explode(',', $forwardedFor)[0]);
        }

        return is_string($server['REMOTE_ADDR'] ?? null) ? $server['REMOTE_ADDR'] : '';
    }
}
