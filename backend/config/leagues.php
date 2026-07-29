<?php

declare(strict_types=1);

// Static league config — display name/color aren't derivable from the data
// files themselves, and the set of leagues doesn't change per-request.
// Mirrors the old frontend LEAGUES constant in src/lib/marketData.ts.
//
// 'folder' => null marks the current, still-running league: it has no
// static data/ folder at all (LeagueRepository skips it entirely) and is
// never fed into the best-investments ranking — its data is instead fetched
// live from poe.ninja and cached (see DataAccess\PoeNinjaClient), and shown
// only as an extra overlay line on whatever the static leagues already
// ranked. Its name/color here are just a fallback; MetaController prefers
// data/current-league.json's own id/color when they match, since that file
// is the one meant to be updated each time the current league changes —
// including 'startDate', which is why there's no 'startDate' key for it
// here: this config would just be a second, driftable source of truth for
// a value that already lives in current-league.json.
//
// The static leagues' 'startDate' is that league's real launch date/time, so
// day 1 means the same calendar date for every item in that league, even
// ones whose own history happens to start later (an item with no trades yet
// on day 1 just has no day-1 row, rather than day 1 silently meaning a
// different real date per item) — or, for an item whose data only starts
// being tracked some days after the league itself launched, no rows at all
// until whichever day its own history actually begins.
return [
    ['id' => 'runes-of-aldur', 'name' => 'Runes of Aldur', 'color' => '#dac74d', 'folder' => null],
    ['id' => 'fate-of-the-vaal', 'name' => 'Fate of the Vaal', 'color' => '#af15a3', 'folder' => 'fate-of-the-vaal', 'startDate' => '2025-12-12T19:00:00Z'],
    ['id' => 'rise-of-the-abyssal', 'name' => 'Rise of the Abyssal', 'color' => '#28bc9c', 'folder' => 'rise-of-the-abyssal', 'startDate' => '2025-08-29T20:00:00Z'],
];
