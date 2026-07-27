<?php

declare(strict_types=1);

namespace App\DataAccess;

// Reads league data from data/*.json on demand, one file per (league,
// category) pair actually requested — deselected leagues/categories are
// never opened. Replaces the old frontend's eager import.meta.glob load of
// every JSON file in the project.
final class LeagueRepository
{
    /** @param array<int, array{id: string, name: string, color: string, folder: string}> $leagueConfigs */
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
        $folder = $this->leagueConfigs[0]['folder'] ?? null;
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
     * Leagues narrowed to only the given league ids, with itemEntries loaded
     * only from the given categories' files, and each entry's pairs narrowed
     * to only the given pair currencies. Skips any (league, category) file
     * that wasn't selected entirely — the actual "don't load everything" win.
     */
    public function loadFiltered(array $leagueIds, array $categories, array $pairCurrencies): array
    {
        $result = [];

        foreach ($this->leagueConfigs as $config) {
            if (!in_array($config['id'], $leagueIds, true)) {
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
                'itemEntries' => $itemEntries,
            ];
        }

        return $result;
    }
}
