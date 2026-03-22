/**
 * Type-safe localStorage helpers with error handling.
 * Centralizes the try-catch + JSON.parse/stringify pattern
 * repeated across multiple stores.
 */

/** Read and parse a JSON value from localStorage. Returns fallback on error or missing key. */
export function getStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw) as T
  } catch {
    /* corrupt data, ignore */
  }
  return fallback
}

/** Serialize a value to JSON and write to localStorage. */
export function setStorageJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Read a plain string from localStorage. */
export function getStorageString(key: string): string | null {
  return localStorage.getItem(key)
}

/** Write a plain string to localStorage, or remove the key if value is null. */
export function setStorageString(key: string, value: string | null): void {
  if (value != null) {
    localStorage.setItem(key, value)
  } else {
    localStorage.removeItem(key)
  }
}

/** Remove a key from localStorage. */
export function removeStorage(key: string): void {
  localStorage.removeItem(key)
}
