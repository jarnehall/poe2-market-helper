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
}
