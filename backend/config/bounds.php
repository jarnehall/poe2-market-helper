<?php

declare(strict_types=1);

// Bounds/defaults for the filter controls — arbitrary UI config, not derived
// from the data, so it lives here rather than being computed per-request.
// Mirrors the constants in the old src/lib/marketData.ts.
return [
    'minDayOfLeague' => 1,
    'maxDayOfLeague' => 51, // MIN_DAY_OF_LEAGUE + SLIDER_DAYS_RANGE (50)
    'minWindowDays' => 0,
    'defaultDaysBack' => 2,
    'defaultDaysForward' => 3,
    'minBestInvestmentCount' => 3,
    'maxBestInvestmentCount' => 18,
    'defaultBestInvestmentCount' => 9,
    'minVolumeFilter' => 0,
    'maxVolumeFilter' => 5000,
    'defaultMinVolume' => 100,
];
