<?php

declare(strict_types=1);

// Per-game poe.ninja API config, keyed the same way as config/leagues.php —
// `detailsUrl` is the per-item endpoint DataAccess\PoeNinjaClient calls for
// the live (still-running) league's overlay data; `typeByCategory` covers
// cases where poe.ninja's `type` query param isn't just the category name
// verbatim (mirrors the separately-maintained POE_NINJA_CATEGORY_SLUGS
// override in src/lib/marketData.ts, but for the API param rather than the
// human economy-page URL slug — that one needs its own per-game entry too).
return [
    'poe2' => [
        'detailsUrl' => 'https://poe.ninja/poe2/api/economy/exchange/current/details',
        'typeByCategory' => [
            'Lineage Gems' => 'LineageSupportGems',
            'Omens' => 'Ritual',
        ],
    ],
    'poe1' => [
        'detailsUrl' => 'https://poe.ninja/poe1/api/economy/exchange/current/details',
        // 'Currency' needs no override; the others do — poe.ninja's own
        // `type` value for each is the singular of the category name
        // (Fragment/Runegraft), or its own CamelCase name with the space
        // removed (AllflameEmber, poe.ninja's actual `item.category` value
        // for these — see loadFiltered()/loadPinned() in LeagueRepository,
        // which overwrite it with our own "Allflame Embers" on load anyway,
        // so this raw value never actually reaches the frontend).
        'typeByCategory' => [
            'Fragments' => 'Fragment',
            'Runegrafts' => 'Runegraft',
            'Allflame Embers' => 'AllflameEmber',
            'Tattoos' => 'Tattoo',
            'Omens' => 'Omen',
            'Divination Cards' => 'DivinationCard',
            'Artifacts' => 'Artifact',
            'Oils' => 'Oil',
        ],
    ],
];
