<?php

declare(strict_types=1);

// Front controller — the only web-exposed PHP entry point. Handles /api/*
// requests directly; everything else falls back to serving the built
// frontend (dist/index.html) for any non-file route (SPA fallback).

$backendDir = dirname(__DIR__);
$repoRoot = dirname($backendDir);

require_once $backendDir . '/src/Http/JsonResponse.php';
require_once $backendDir . '/src/Http/QueryParams.php';
require_once $backendDir . '/src/Http/Router.php';
require_once $backendDir . '/src/DataAccess/LeagueRepository.php';
require_once $backendDir . '/src/DataAccess/PoeNinjaClient.php';
require_once $backendDir . '/src/DataAccess/VisitorTracker.php';
require_once $backendDir . '/src/Domain/MarketData.php';
require_once $backendDir . '/src/Api/InvestmentPayloadBuilder.php';
require_once $backendDir . '/src/Api/MetaController.php';
require_once $backendDir . '/src/Api/BestInvestmentsController.php';
require_once $backendDir . '/src/Api/FavoritesController.php';
require_once $backendDir . '/src/Api/ItemsController.php';
require_once $backendDir . '/src/Api/CurrentLeaguesController.php';
require_once $backendDir . '/src/Api/PoeNinjaCacheController.php';

use App\Api\BestInvestmentsController;
use App\Api\CurrentLeaguesController;
use App\Api\FavoritesController;
use App\Api\InvestmentPayloadBuilder;
use App\Api\ItemsController;
use App\Api\MetaController;
use App\Api\PoeNinjaCacheController;
use App\DataAccess\LeagueRepository;
use App\DataAccess\PoeNinjaClient;
use App\DataAccess\VisitorTracker;
use App\Http\JsonResponse;
use App\Http\Router;

// Which game ('poe1'/'poe2') this request is scoped to — resolved once,
// here, before constructing anything else. Everything below is built
// game-scoped from this single point (data dir, league config, poe.ninja
// endpoint), so LeagueRepository/PoeNinjaClient/the controllers themselves
// never need their own `game` branching — they just operate on whatever
// game-specific inputs they're handed.
$leagueConfigsByGame = require $backendDir . '/config/leagues.php';
$poeNinjaConfigsByGame = require $backendDir . '/config/poe-ninja.php';

$game = $_GET['game'] ?? 'poe2';
if (!is_string($game) || !isset($leagueConfigsByGame[$game])) {
    JsonResponse::send(['error' => "Unknown game: {$game}"], 400);
}

$dataDir = $repoRoot . '/data/' . $game;
$leagueConfigs = $leagueConfigsByGame[$game];
$poeNinjaConfig = $poeNinjaConfigsByGame[$game];
$bounds = require $backendDir . '/config/bounds.php';

$repository = new LeagueRepository($dataDir, $leagueConfigs);
$currentLeagueInfo = $repository->currentLeagueInfo();

// poe.ninja's own `league` query value isn't always the league's display
// name (e.g. POE1's "Curse of the Allflame" is poe.ninja's "Allflame") —
// leagues.php's matching static entry can override it via 'poeNinjaLeague';
// most leagues don't need one, so this just falls back to the display name.
$liveLeagueConfig = null;
foreach ($leagueConfigs as $config) {
    if ($config['id'] === ($currentLeagueInfo['id'] ?? null)) {
        $liveLeagueConfig = $config;
        break;
    }
}
$poeNinjaLeagueName = $liveLeagueConfig['poeNinjaLeague'] ?? $currentLeagueInfo['name'];

$poeNinjaClient = new PoeNinjaClient(
    $poeNinjaLeagueName,
    $dataDir . '/cache/' . $currentLeagueInfo['id'] . '.json',
    $poeNinjaConfig['detailsUrl'],
    $poeNinjaConfig['typeByCategory'],
);
$payloadBuilder = new InvestmentPayloadBuilder($poeNinjaClient, $currentLeagueInfo);
// __FILE__ (not a hardcoded path) so this works whether index.php is run
// directly (dev server) or required from public_html/api.php (one.com) —
// its mtime changes whenever this file is re-uploaded, which is what lets
// VisitorTracker detect "a new deploy happened" with no manual reset step.
// Deliberately the top-level (not game-scoped) data dir — visits are
// counted once for the app overall, not split per game.
$visitorTracker = new VisitorTracker($repoRoot . '/data/analytics/visitors.json', (int) filemtime(__FILE__));

$requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
$method = $_SERVER['REQUEST_METHOD'];

if (str_starts_with($requestPath, '/api/')) {
    // The day-of-league slider's upper bound: as far as any static league's
    // own history reaches, or as far as the live league's real elapsed days
    // reaches (it only grows longer as the league goes on), whichever is
    // further. The league's startDate side is rounded UP to the next UTC
    // midnight (a no-op if already exact), same as Domain\MarketData's
    // day-of-league math (and the frontend's identical "today" calculation
    // in src/lib/marketData.ts) — no history snapshot can exist before the
    // league's actual launch moment, so day 1 is the first midnight at or
    // after it, not startDate's own calendar day.
    $todayMidnight = intdiv(time(), 86400) * 86400;
    $leagueStart = strtotime($currentLeagueInfo['startDate']);
    $leagueStartMidnight = intdiv($leagueStart, 86400) * 86400;
    if ($leagueStart % 86400 !== 0) {
        $leagueStartMidnight += 86400;
    }
    $liveLeagueDayOfLeague = (int) round(($todayMidnight - $leagueStartMidnight) / 86400) + 1;
    $bounds['maxDayOfLeague'] = max(
        $repository->maxAvailableDayOfLeague(),
        $liveLeagueDayOfLeague,
        $bounds['minDayOfLeague'],
    );

    $router = new Router();
    $router->get(
        '#^/api/meta$#',
        fn() => (new MetaController($repository, $leagueConfigs, $bounds, $visitorTracker))->index($_SERVER),
    );
    $router->get(
        '#^/api/best-investments$#',
        fn() => (new BestInvestmentsController(
            $repository,
            $leagueConfigs,
            $bounds,
            $payloadBuilder,
        ))->index($_GET),
    );
    $router->get(
        '#^/api/favorites$#',
        fn() => (new FavoritesController(
            $repository,
            $leagueConfigs,
            $bounds,
            $payloadBuilder,
        ))->index($_GET),
    );
    $router->get(
        '#^/api/items$#',
        fn() => (new ItemsController($repository))->index(),
    );
    // Not game-scoped (unlike every route above) — see CurrentLeaguesController.
    $router->get(
        '#^/api/current-leagues$#',
        fn() => (new CurrentLeaguesController($repoRoot))->index(),
    );
    // Also not game-scoped — clears every game's poe.ninja cache, not just
    // whichever one happened to be open.
    $router->post(
        '#^/api/reset-poe-ninja-cache$#',
        fn() => (new PoeNinjaCacheController($repoRoot))->index(file_get_contents('php://input')),
    );
    $router->dispatch($method, $requestPath);

    return;
}

// Static/SPA fallback — only reachable when this front controller is the
// docroot's router (`php -S -t dist ...`, or an equivalent webserver rewrite
// in production); the dev workflow's API-only PHP server never receives
// non-/api/ requests at all (Vite only proxies /api/ to it).
$docRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? ($repoRoot . '/dist'), '/');
$requestedFile = $docRoot . $requestPath;

if ($requestPath !== '/' && is_file($requestedFile)) {
    // A real static asset exists — let the built-in server (or webserver)
    // serve it directly, with the correct content-type.
    return false;
}

$indexHtml = is_file($docRoot . '/index.html') ? $docRoot . '/index.html' : ($repoRoot . '/dist/index.html');

if (is_file($indexHtml)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($indexHtml);

    return;
}

http_response_code(404);
echo 'Frontend not built yet — run `npm run build`.';
