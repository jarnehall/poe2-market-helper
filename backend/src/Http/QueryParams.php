<?php

declare(strict_types=1);

namespace App\Http;

// Tiny query-string parsing helpers shared by every /api/* controller that
// takes comma-separated list params and clamped numeric bounds (currently
// BestInvestmentsController and FavoritesController).
final class QueryParams
{
    public static function splitParam(mixed $value): array
    {
        if (!is_string($value)) {
            return [];
        }

        $value = trim($value);
        if ($value === '') {
            return [];
        }

        return array_values(array_filter(
            array_map('trim', explode(',', $value)),
            fn(string $v): bool => $v !== '',
        ));
    }

    public static function clampInt(mixed $value, int $min, int $max): int
    {
        $n = is_string($value) && $value !== '' ? (int) $value : $min;

        return max($min, min($max, $n));
    }

    public static function clampFloat(mixed $value, float $min, float $max): float
    {
        $n = is_string($value) && $value !== '' ? (float) $value : $min;

        return max($min, min($max, $n));
    }

    public static function bool(mixed $value): bool
    {
        return $value === '1' || $value === 'true';
    }

    /**
     * Parses "id:weight,id:weight" (see src/context/FiltersContext.tsx's
     * own encoding) into ['id' => weight]. A malformed entry (missing the
     * colon, a non-numeric weight) is skipped rather than erroring the
     * whole request — a stale hand-edited URL shouldn't break ranking, it
     * should just fall back to a default weight for whichever leagues it
     * failed to parse (see MarketData::defaultLeagueWeights and its use in
     * BestInvestmentsController).
     *
     * @return array<string, float>
     */
    public static function parseWeightMap(mixed $value): array
    {
        $weights = [];
        foreach (self::splitParam($value) as $pair) {
            $parts = explode(':', $pair, 2);
            if (count($parts) !== 2) {
                continue;
            }
            [$id, $weight] = $parts;
            if ($id === '' || !is_numeric($weight)) {
                continue;
            }
            $weights[$id] = (float) $weight;
        }

        return $weights;
    }
}
