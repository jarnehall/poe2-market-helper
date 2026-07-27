<?php

declare(strict_types=1);

// Static league config — display name/color aren't derivable from the data
// files themselves, and the set of leagues doesn't change per-request.
// Mirrors the old frontend LEAGUES constant in src/lib/marketData.ts.
return [
    ['id' => 'runes-of-aldur', 'name' => 'Runes of Aldur', 'color' => '#2c8ed4', 'folder' => 'runes-of-aldur'],
    ['id' => 'fate-of-the-vaal', 'name' => 'Fate of the Vaal', 'color' => '#d94a4a', 'folder' => 'fate-of-the-vaal'],
    ['id' => 'rise-of-the-abyssal', 'name' => 'Rise of the Abyssal', 'color' => '#3fae5f', 'folder' => 'rise-of-the-abyssal'],
];
