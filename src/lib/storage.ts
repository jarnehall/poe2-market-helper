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
