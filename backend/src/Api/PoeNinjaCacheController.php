<?php

declare(strict_types=1);

namespace App\Api;

use App\Http\JsonResponse;

// Manual "forget everything poe.ninja told us, refetch on the next
// request" button — not scoped to a single game (like CurrentLeaguesController),
// since "reset the cache" should mean every game's, not just whichever one
// happened to be open when the button was clicked. The frontend's own
// confirmation prompt is the only real gate (see Settings dropdown) — the
// password check here is a second, low-stakes backstop against something
// hitting this endpoint directly, not real authentication.
final class PoeNinjaCacheController
{
    private const PASSWORD = 'poe.ninja reset';

    public function __construct(
        private readonly string $repoRoot,
    ) {
    }

    public function index(mixed $rawBody): void
    {
        $decoded = is_string($rawBody) ? json_decode($rawBody, true) : null;
        $password = is_array($decoded) && is_string($decoded['password'] ?? null) ? $decoded['password'] : '';

        if ($password !== self::PASSWORD) {
            JsonResponse::send(['error' => 'Incorrect password'], 403);
        }

        $cleared = [];
        foreach (glob($this->repoRoot . '/data/*/cache/*.json') ?: [] as $cacheFile) {
            if (unlink($cacheFile)) {
                // Windows' glob() returns backslashes; normalized to '/' so
                // this reads the same regardless of platform.
                $cleared[] = ltrim(str_replace([$this->repoRoot, '\\'], ['', '/'], $cacheFile), '/');
            }
        }

        JsonResponse::send(['cleared' => $cleared]);
    }
}
