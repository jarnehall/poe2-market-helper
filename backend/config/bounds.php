<?php

declare(strict_types=1);

// Bounds/defaults for the filter controls — arbitrary UI config, not derived
// from the data, so it lives here rather than being computed per-request.
// Mirrors the constants in the old src/lib/marketData.ts.
//
// maxDayOfLeague is NOT here — it's computed per-request in public/index.php
// from how much history actually exists (see LeagueRepository::maxAvailableDayOfLeague
// and the live league's real elapsed days), then merged into these bounds.
return [
    'minDayOfLeague' => 1,
    'minWindowDays' => 0,
    'maxWindowDays' => 10,
    'defaultDaysBack' => 2,
    'defaultDaysForward' => 3,
    'minBestInvestmentCount' => 3,
    'maxBestInvestmentCount' => 18,
    'defaultBestInvestmentCount' => 9,
    'minVolumeFilter' => 0,
    'maxVolumeFilter' => 1000,
    'defaultMinVolume' => 100,
];
