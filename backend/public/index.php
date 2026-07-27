<?php

declare(strict_types=1);

// Front controller — the only web-exposed PHP entry point. Handles /api/*
// requests directly; everything else falls back to serving the built
// frontend (dist/index.html) for any non-file route (SPA fallback).

$backendDir = dirname(__DIR__);
$repoRoot = dirname($backendDir);

require_once $backendDir . '/src/Http/JsonResponse.php';
require_once $backendDir . '/src/Http/Router.php';
require_once $backendDir . '/src/DataAccess/LeagueRepository.php';
require_once $backendDir . '/src/Domain/MarketData.php';
require_once $backendDir . '/src/Api/MetaController.php';
require_once $backendDir . '/src/Api/BestInvestmentsController.php';

use App\Api\BestInvestmentsController;
use App\Api\MetaController;
use App\DataAccess\LeagueRepository;
use App\Http\JsonResponse;
use App\Http\Router;

$dataDir = $repoRoot . '/data';
$leagueConfigs = require $backendDir . '/config/leagues.php';
$bounds = require $backendDir . '/config/bounds.php';

$repository = new LeagueRepository($dataDir, $leagueConfigs);

$requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
$method = $_SERVER['REQUEST_METHOD'];

if (str_starts_with($requestPath, '/api/')) {
    $router = new Router();
    $router->get('#^/api/meta$#', fn() => (new MetaController($repository, $leagueConfigs, $bounds))->index());
    $router->get(
        '#^/api/best-investments$#',
        fn() => (new BestInvestmentsController($repository, $leagueConfigs, $bounds))->index($_GET),
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
