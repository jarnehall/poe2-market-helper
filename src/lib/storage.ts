const STORAGE_PREFIX = 'poe2-market-guide:'

export function getStoredNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (raw === null) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function setStoredNumber(key: string, value: number): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(value))
}

export function getStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (raw === null) return fallback
  return raw === 'true'
}

export function setStoredBoolean(key: string, value: boolean): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(value))
}

export function getStoredStringArray(
  key: string,
  fallback: string[],
): string[] {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed
    }
  } catch {
    // Malformed data, fall through to the fallback.
  }
  return fallback
}

export function setStoredStringArray(key: string, value: string[]): void {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
}
