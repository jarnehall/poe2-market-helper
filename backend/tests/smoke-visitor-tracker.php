<?php

declare(strict_types=1);

// Dependency-free smoke tests for DataAccess\VisitorTracker. Run with:
//   <php-bin> backend/tests/smoke-visitor-tracker.php

require_once __DIR__ . '/../src/DataAccess/VisitorTracker.php';

use App\DataAccess\VisitorTracker;

$failures = 0;

function check(bool $condition, string $label): void
{
    global $failures;
    if ($condition) {
        echo "PASS: {$label}\n";
    } else {
        fwrite(STDERR, "FAIL: {$label}\n");
        $failures++;
    }
}

$storeFile = sys_get_temp_dir() . '/poe2-market-guide-smoke-visitors-' . uniqid() . '.json';
$deployEpoch = 1_700_000_000;

// --- Distinct IPs each count once; the same IP visiting again doesn't ---

$tracker = new VisitorTracker($storeFile, $deployEpoch);
check($tracker->recordVisitAndCount('1.1.1.1') === 1, 'the first-ever visitor makes the count 1');
check($tracker->recordVisitAndCount('2.2.2.2') === 2, 'a second, distinct IP makes the count 2');
check($tracker->recordVisitAndCount('1.1.1.1') === 2, 'the same IP visiting again does not increase the count');

// --- A new tracker instance against the same file (i.e. the next HTTP ---
// --- request) picks up the persisted count, not a fresh in-memory one ---

$reopened = new VisitorTracker($storeFile, $deployEpoch);
check($reopened->recordVisitAndCount('3.3.3.3') === 3, 'a fresh instance (new request) against the same store file and deploy epoch continues the same count');

// --- A different deploy epoch resets the count — this is what makes ---
// --- "since last deploy" work with no manual reset step ---

$afterRedeploy = new VisitorTracker($storeFile, $deployEpoch + 1);
check($afterRedeploy->recordVisitAndCount('4.4.4.4') === 1, 'a new deploy epoch resets the count back to 1, discarding the previous deploy\'s visitors');

// Raw IPs are never persisted, only their hash.
$raw = file_get_contents($storeFile);
check($raw !== false && !str_contains($raw, '4.4.4.4'), 'the raw IP address is never written to the store file, only its hash');

@unlink($storeFile);

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} check(s) failed.\n");
    exit(1);
}

echo "\nAll checks passed.\n";
