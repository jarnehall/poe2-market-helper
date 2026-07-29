<?php

declare(strict_types=1);

namespace App\DataAccess;

/**
 * Fetches per-item detail entries for the current, still-running league
 * directly from poe.ninja, caching them to a single on-disk JSON file so
 * the same item is only re-fetched once every CACHE_TTL_SECONDS.
 *
 * Not calendar-day-based on purpose: poe.ninja publishes each day's new
 * snapshot at some point *during* that UTC day, not exactly at midnight, so
 * a "once per UTC calendar day" cache can get unlucky — whichever request
 * happens to be the day's first for an item is a gamble, and if it lands
 * even a minute before poe.ninja publishes, that item is stuck with
 * yesterday's data for a full 24 hours rather than just until poe.ninja
 * catches up. A rolling TTL instead just means an unlucky early fetch tries
 * again a couple of hours later — self-correcting within the same day —
 * while still only firing a handful of requests per item per day.
 *
 * Only ever fetches specific (item id, category) pairs the caller already
 * knows it needs (e.g. whatever the static-league ranking already picked)
 * — never enumerates "every item in a category", so a request needs at
 * most a handful of poe.ninja calls, not hundreds.
 */
final class PoeNinjaClient
{
    private const DETAILS_URL = 'https://poe.ninja/poe2/api/economy/exchange/current/details';
    private const USER_AGENT = 'poe2-market-guide/1.0 (personal project; +https://poe2.jarnehall.se/)';
    private const TIMEOUT_SECONDS = 10;
    private const CACHE_TTL_SECONDS = 2 * 60 * 60;

    // poe.ninja's `type` query param isn't always just the category name —
    // this mirrors the (separately-maintained) POE_NINJA_CATEGORY_SLUGS
    // override in the old frontend code, but for the API param rather than
    // the human economy-page URL slug.
    private const TYPE_BY_CATEGORY = [
        'Lineage Gems' => 'LineageSupportGems',
        'Omens' => 'Ritual',
    ];

    // Populated by the most recent getEntries() call — lets the caller
    // report "did any of THIS request's poe.ninja fetches fail" (e.g. for a
    // status indicator) without changing getEntries()'s own return shape,
    // which callers already rely on for the actual per-item data. Reset at
    // the start of every call, so a fresh PoeNinjaClient per HTTP request
    // (see public/index.php) never carries over a previous request's result.
    private array $lastFailedItemIds = [];
    private int $lastAttemptedCount = 0;

    public function __construct(
        private readonly string $leagueName,
        private readonly string $cacheFile,
    ) {
    }

    /** Item ids that had a genuine network/HTTP failure on the last getEntries() call (never populated for cache hits or a confirmed "no trade data yet" response). */
    public function getLastFailedItemIds(): array
    {
        return $this->lastFailedItemIds;
    }

    /** How many items actually required a fresh network fetch (not served from a still-fresh cache entry) on the last getEntries() call. */
    public function getLastAttemptedCount(): int
    {
        return $this->lastAttemptedCount;
    }

    /**
     * @param array<int, array{itemId: string, category: string}> $items
     * @return array<string, array{item: array, pairs: array, core: array}|null> itemId => entry, or null if
     *     poe.ninja has no data for that item in this league (e.g. not traded yet).
     */
    public function getEntries(array $items): array
    {
        $this->lastFailedItemIds = [];
        $this->lastAttemptedCount = 0;

        $cache = $this->readCache();
        $now = time();

        $result = [];
        $toFetch = [];

        foreach ($items as $item) {
            $itemId = $item['itemId'];
            $cached = $cache[$itemId] ?? null;
            // A cache entry from before this TTL-based scheme (still keyed
            // by 'fetchedDate') has no 'fetchedAt' at all — ?? 0 makes that
            // look infinitely stale, so it's simply refetched and upgraded
            // to the new format on write, no explicit migration needed.
            if ($cached !== null && $now - ($cached['fetchedAt'] ?? 0) < self::CACHE_TTL_SECONDS) {
                $result[$itemId] = $cached['entry'];
            } else {
                $toFetch[$itemId] = $item['category'];
            }
        }

        if ($toFetch === []) {
            return $result;
        }

        $this->lastAttemptedCount = count($toFetch);
        $fetched = $this->fetchMany($toFetch);
        $cacheChanged = false;

        foreach ($toFetch as $itemId => $category) {
            if (!array_key_exists($itemId, $fetched)) {
                // A network/HTTP-level failure — don't cache it, so the next
                // request tries again instead of being stuck null for the
                // rest of the TTL window.
                $result[$itemId] = null;
                $this->lastFailedItemIds[] = $itemId;
                continue;
            }

            $entry = $fetched[$itemId];
            $result[$itemId] = $entry;
            $cache[$itemId] = ['fetchedAt' => $now, 'entry' => $entry];
            $cacheChanged = true;
        }

        if ($cacheChanged) {
            $this->writeCache($cache);
        }

        return $result;
    }

    /**
     * @param array<string, string> $itemIdToCategory
     * @return array<string, array{item: array, pairs: array, core: array}|null> only items that got a
     *     genuine (non-error) response from poe.ninja — a missing key means the request itself failed.
     */
    private function fetchMany(array $itemIdToCategory): array
    {
        $multi = curl_multi_init();
        $handles = [];

        foreach ($itemIdToCategory as $itemId => $category) {
            $type = self::TYPE_BY_CATEGORY[$category] ?? $category;
            $url = self::DETAILS_URL . '?' . http_build_query([
                'league' => $this->leagueName,
                'type' => $type,
                'id' => $itemId,
            ]);

            $handle = curl_init($url);
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
                CURLOPT_USERAGENT => self::USER_AGENT,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
                // This machine's PHP/curl has no CA bundle configured, so TLS
                // verification fails outright with no bundle at all — by
                // explicit choice (not a default), left off rather than
                // wiring up a cacert.pem, since this only ever talks to one
                // fixed, known host for personal/local use. Revisit before
                // any real deployment: point CURLOPT_CAINFO at a real CA
                // bundle and re-enable both of these instead.
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);
            curl_multi_add_handle($multi, $handle);
            $handles[$itemId] = $handle;
        }

        $running = null;
        do {
            $status = curl_multi_exec($multi, $running);
            if ($running > 0) {
                curl_multi_select($multi);
            }
        } while ($running > 0 && $status === CURLM_OK);

        $entries = [];
        foreach ($handles as $itemId => $handle) {
            $statusCode = curl_getinfo($handle, CURLINFO_HTTP_CODE);
            $body = curl_multi_getcontent($handle);
            $error = curl_error($handle);
            curl_multi_remove_handle($multi, $handle);
            // No curl_close() here: it's been a no-op since PHP 8.0 (handles
            // are freed automatically), and PHP 8.5 deprecates calling it.

            if ($error !== '' || $statusCode !== 200 || $body === null || $body === '') {
                continue;
            }

            $decoded = json_decode($body, true);
            if (!is_array($decoded) || !isset($decoded['item'], $decoded['pairs'], $decoded['core'])) {
                continue;
            }

            // Valid response, but poe.ninja has no trade data for this item
            // in this league yet — a real "nothing to show", not a failure.
            $entries[$itemId] = $decoded['pairs'] === [] ? null : $decoded;
        }

        curl_multi_close($multi);

        return $entries;
    }

    private function readCache(): array
    {
        if (!is_file($this->cacheFile)) {
            return [];
        }

        $handle = fopen($this->cacheFile, 'r');
        if ($handle === false) {
            return [];
        }

        flock($handle, LOCK_SH);
        $contents = stream_get_contents($handle);
        flock($handle, LOCK_UN);
        fclose($handle);

        $decoded = json_decode((string) $contents, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function writeCache(array $cache): void
    {
        $dir = dirname($this->cacheFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        $handle = fopen($this->cacheFile, 'c+');
        if ($handle === false) {
            return;
        }

        flock($handle, LOCK_EX);
        // Re-read under the lock and merge, so a concurrent request that
        // fetched a different item in parallel doesn't get its update
        // clobbered by this write.
        rewind($handle);
        $current = json_decode((string) stream_get_contents($handle), true);
        $merged = is_array($current) ? array_merge($current, $cache) : $cache;

        ftruncate($handle, 0);
        rewind($handle);
        // JSON_PRESERVE_ZERO_FRACTION matters here: without it, a whole-
        // number rate like 816.0 gets written back as "816" and comes back
        // out of the next readCache() as an int instead of a float —
        // harmless for the frontend (JS doesn't distinguish them), but a
        // real type-stability bug in the cached data itself.
        fwrite($handle, json_encode(
            $merged,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION,
        ));
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
