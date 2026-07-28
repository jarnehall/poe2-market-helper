<?php

declare(strict_types=1);

namespace App\DataAccess;

// Reads league data from data/*.json on demand, one file per (league,
// category) pair actually requested — deselected leagues/categories are
// never opened. Replaces the old frontend's eager import.meta.glob load of
// every JSON file in the project.
final class LeagueRepository
{
    /** @param array<int, array{id: string, name: string, color: string, folder: ?string, startDate?: string}> $leagueConfigs */
    public function __construct(
        private readonly string $dataDir,
        private readonly array $leagueConfigs,
    ) {
    }

    public function leagueIds(): array
    {
        return array_map(fn(array $config): string => $config['id'], $this->leagueConfigs);
    }

    public function currentLeagueInfo(): array
    {
        $path = $this->dataDir . '/current-league.json';

        return json_decode(file_get_contents($path), true);
    }

    /** The category a data file's items are filed under is the file's own name (currency.json -> "Currency"). */
    private static function categoryFromFilename(string $filename): string
    {
        $name = preg_replace('/\.json$/', '', $filename);
        $words = explode('-', $name);

        return implode(' ', array_map(ucfirst(...), $words));
    }

    private static function filenameFromCategory(string $category): string
    {
        return strtolower(str_replace(' ', '-', $category)) . '.json';
    }

    /** Every category found across every league's data folder — all folders share the same file names. */
    public function listCategories(): array
    {
        $folder = null;
        foreach ($this->leagueConfigs as $config) {
            if ($config['folder'] !== null) {
                $folder = $config['folder'];
                break;
            }
        }
        if ($folder === null) {
            return [];
        }

        $files = glob($this->dataDir . '/' . $folder . '/*.json') ?: [];
        $categories = array_map(fn(string $file): string => self::categoryFromFilename(basename($file)), $files);
        sort($categories);

        return $categories;
    }

    /** Every currency any item can be traded against, across every league/category — requires parsing every file once. */
    public function listPairCurrencies(): array
    {
        $pairIds = [];
        $names = []; // pair id => display name, resolved via any entry's core.items

        foreach ($this->leagueConfigs as $config) {
            if ($config['folder'] === null) {
                continue;
            }
            $files = glob($this->dataDir . '/' . $config['folder'] . '/*.json') ?: [];
            foreach ($files as $file) {
                $entries = json_decode(file_get_contents($file), true) ?: [];
                foreach ($entries as $entry) {
                    foreach ($entry['pairs'] as $pair) {
                        $pairIds[$pair['id']] = true;
                    }
                    foreach ($entry['core']['items'] as $coreItem) {
                        if (!isset($names[$coreItem['id']])) {
                            $names[$coreItem['id']] = $coreItem['name'];
                        }
                    }
                }
            }
        }

        $ids = array_keys($pairIds);
        sort($ids);

        return array_map(
            fn(string $id): array => ['id' => $id, 'name' => $names[$id] ?? $id],
            $ids,
        );
    }

    /**
     * How far day-of-league reaches for any single pair, across every
     * static league — each pair's newest entry vs. its own league's
     * startDate (day-of-league is always anchored to the league's start,
     * never a pair's own oldest entry — see getAllHistoryRows). Used
     * (alongside the live league's real elapsed days) as the day-of-league
     * slider's upper bound, so it's always just big enough to cover
     * whatever data actually exists instead of an arbitrary fixed constant.
     */
    public function maxAvailableDayOfLeague(): int
    {
        $maxDays = 1;

        foreach ($this->leagueConfigs as $config) {
            if ($config['folder'] === null) {
                continue;
            }

            // Rounded UP to the next UTC midnight (a no-op if already exact)
            // to match Domain\MarketData's own day-of-league math: a
            // league's startDate is a real launch moment (e.g. 19:00Z), and
            // no history snapshot can exist before that moment, so the
            // first midnight snapshot that can possibly reflect real data is
            // the *next* one after startDate, not startDate's own day.
            $startTime = intdiv(strtotime($config['startDate']), 86400) * 86400;
            if (strtotime($config['startDate']) % 86400 !== 0) {
                $startTime += 86400;
            }

            $files = glob($this->dataDir . '/' . $config['folder'] . '/*.json') ?: [];
            foreach ($files as $file) {
                $entries = json_decode(file_get_contents($file), true) ?: [];
                foreach ($entries as $entry) {
                    foreach ($entry['pairs'] as $pair) {
                        $history = $pair['history'];
                        if (count($history) === 0) {
                            continue;
                        }

                        $newest = intdiv(strtotime($history[0]['timestamp']), 86400) * 86400;
                        $days = (int) round(($newest - $startTime) / 86400) + 1;
                        if ($days > $maxDays) {
                            $maxDays = $days;
                        }
                    }
                }
            }
        }

        return $maxDays;
    }

    /**
     * Leagues narrowed to only the given league ids, with itemEntries loaded
     * only from the given categories' files, and each entry's pairs narrowed
     * to only the given pair currencies. Skips any (league, category) file
     * that wasn't selected entirely — the actual "don't load everything" win.
     */
    public function loadFiltered(array $leagueIds, array $categories, array $pairCurrencies): array
    {
        $result = [];

        foreach ($this->leagueConfigs as $config) {
            if (!in_array($config['id'], $leagueIds, true) || $config['folder'] === null) {
                continue;
            }

            $itemEntries = [];
            foreach ($categories as $category) {
                $path = $this->dataDir . '/' . $config['folder'] . '/' . self::filenameFromCategory($category);
                if (!is_file($path)) {
                    continue;
                }

                $entries = json_decode(file_get_contents($path), true);
                if (!is_array($entries)) {
                    continue;
                }

                foreach ($entries as $entry) {
                    $entry['item']['category'] = $category;
                    $entry['pairs'] = array_values(array_filter(
                        $entry['pairs'],
                        fn(array $pair): bool => in_array($pair['id'], $pairCurrencies, true),
                    ));
                    $itemEntries[] = $entry;
                }
            }

            $result[] = [
                'id' => $config['id'],
                'name' => $config['name'],
                'color' => $config['color'],
                'startDate' => $config['startDate'],
                'itemEntries' => $itemEntries,
            ];
        }

        return $result;
    }

    /**
     * Leagues narrowed to only the given league ids, with itemEntries loaded
     * only for the exact (category, itemId) pairs given — unlike
     * loadFiltered(), this ignores any category/pairCurrency selection
     * entirely, so a pinned/favorited item keeps showing regardless of the
     * user's current filter selection. Each entry's pairs are narrowed to
     * just that pin's own pairId.
     *
     * @param array<int, array{category: string, itemId: string, pairId: string}> $pins
     */
    public function loadPinned(array $leagueIds, array $pins): array
    {
        $itemIdsByCategory = [];
        $pairIdByItemId = [];
        foreach ($pins as $pin) {
            $itemIdsByCategory[$pin['category']][] = $pin['itemId'];
            $pairIdByItemId[$pin['itemId']] = $pin['pairId'];
        }

        $result = [];

        foreach ($this->leagueConfigs as $config) {
            if (!in_array($config['id'], $leagueIds, true) || $config['folder'] === null) {
                continue;
            }

            $itemEntries = [];
            foreach ($itemIdsByCategory as $category => $itemIds) {
                $path = $this->dataDir . '/' . $config['folder'] . '/' . self::filenameFromCategory($category);
                if (!is_file($path)) {
                    continue;
                }

                $entries = json_decode(file_get_contents($path), true);
                if (!is_array($entries)) {
                    continue;
                }

                foreach ($entries as $entry) {
                    if (!in_array($entry['item']['id'], $itemIds, true)) {
                        continue;
                    }

                    $entry['item']['category'] = $category;
                    $wantedPairId = $pairIdByItemId[$entry['item']['id']];
                    $entry['pairs'] = array_values(array_filter(
                        $entry['pairs'],
                        fn(array $pair): bool => $pair['id'] === $wantedPairId,
                    ));
                    $itemEntries[] = $entry;
                }
            }

            $result[] = [
                'id' => $config['id'],
                'name' => $config['name'],
                'color' => $config['color'],
                'startDate' => $config['startDate'],
                'itemEntries' => $itemEntries,
            ];
        }

        return $result;
    }

    /**
     * Every distinct item across every league/category — the catalog the
     * favorites search box matches against, deliberately not narrowed by any
     * league/category/pairCurrency selection (same "always find it"
     * reasoning as loadPinned). Each item comes with a suggested pairId to
     * favorite it under: its own core.primary (poe.ninja's own "main"
     * currency for that item, e.g. Divine Orb), falling back to whichever
     * pair it actually has data for if primary isn't one of them.
     */
    public function listAllItems(): array
    {
        $byId = [];

        foreach ($this->leagueConfigs as $config) {
            if ($config['folder'] === null) {
                continue;
            }

            $files = glob($this->dataDir . '/' . $config['folder'] . '/*.json') ?: [];
            foreach ($files as $file) {
                $category = self::categoryFromFilename(basename($file));
                $entries = json_decode(file_get_contents($file), true) ?: [];

                foreach ($entries as $entry) {
                    $itemId = $entry['item']['id'];
                    if (isset($byId[$itemId])) {
                        continue;
                    }

                    $pairIds = array_map(fn(array $pair): string => $pair['id'], $entry['pairs']);
                    if ($pairIds === []) {
                        continue;
                    }

                    $primary = $entry['core']['primary'] ?? null;
                    $pairId = ($primary !== null && in_array($primary, $pairIds, true)) ? $primary : $pairIds[0];

                    $byId[$itemId] = [
                        'id' => $itemId,
                        'name' => $entry['item']['name'],
                        'image' => $entry['item']['image'],
                        'category' => $category,
                        'detailsId' => $entry['item']['detailsId'],
                        'pairId' => $pairId,
                    ];
                }
            }
        }

        $items = array_values($byId);
        usort($items, fn(array $a, array $b): int => strcasecmp($a['name'], $b['name']));

        return $items;
    }
}
