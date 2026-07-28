<?php

declare(strict_types=1);

namespace App\DataAccess;

/**
 * Counts unique visitors (by IP) since the app was last deployed, persisted
 * to a single on-disk JSON file (same read-modify-write-under-lock pattern
 * as PoeNinjaClient's cache).
 *
 * "Since last deploy" is inferred from the deploy epoch the caller passes
 * in (see public/index.php, which uses this front controller's own
 * filemtime()) rather than tracked here — whenever that epoch differs from
 * the one stored in the file, this treats it as a new deploy and starts a
 * fresh count, with no manual reset step needed after uploading new code.
 */
final class VisitorTracker
{
    public function __construct(
        private readonly string $storeFile,
        private readonly int $deployEpoch,
    ) {
    }

    /** Records this IP as having visited (a no-op if already recorded since the current deploy) and returns the current unique-visitor count. */
    public function recordVisitAndCount(string $ip): int
    {
        $dir = dirname($this->storeFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        $handle = fopen($this->storeFile, 'c+');
        if ($handle === false) {
            return 1;
        }

        flock($handle, LOCK_EX);
        rewind($handle);
        $data = json_decode((string) stream_get_contents($handle), true);
        if (!is_array($data) || ($data['epoch'] ?? null) !== $this->deployEpoch) {
            // First request ever, or a new deploy happened since this file
            // was last written (detected via the epoch mismatch) — any
            // visitor ids recorded under a previous deploy are permanently
            // irrelevant to "since last deploy", so this starts clean
            // rather than letting the file grow forever.
            $data = ['epoch' => $this->deployEpoch, 'ips' => []];
        }

        // Only the hash is stored, never the raw IP — this only ever needs
        // to answer "how many distinct visitors", not "who visited".
        $data['ips'][hash('sha256', $ip)] = true;
        $count = count($data['ips']);

        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($data));
        flock($handle, LOCK_UN);
        fclose($handle);

        return $count;
    }
}
