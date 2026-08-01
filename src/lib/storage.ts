export function getStoredNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function setStoredNumber(key: string, value: number): void {
  localStorage.setItem(key, String(value))
}

export function getStoredString(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback
}

export function setStoredString(key: string, value: string): void {
  localStorage.setItem(key, value)
}

export function getStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export function setStoredBoolean(key: string, value: boolean): void {
  localStorage.setItem(key, String(value))
}

export function getStoredStringArray(
  key: string,
  fallback: string[],
): string[] {
  const raw = localStorage.getItem(key)
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
  localStorage.setItem(key, JSON.stringify(value))
}

// Used for per-league ranking weights (see FiltersContext.tsx) — keyed by
// league id since which leagues even exist to have a weight varies by
// selection, unlike a fixed-shape settings object.
export function getStoredNumberRecord(
  key: string,
  fallback: Record<string, number>,
): Record<string, number> {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      return parsed as Record<string, number>
    }
  } catch {
    // Malformed data, fall through to the fallback.
  }
  return fallback
}

export function setStoredNumberRecord(key: string, value: Record<string, number>): void {
  localStorage.setItem(key, JSON.stringify(value))
}
