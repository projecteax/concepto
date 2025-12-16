import { useEffect, useState } from 'react';

type Serializer<T> = (value: T) => string;
type Deserializer<T> = (raw: string) => T;

/**
 * Session-scoped state backed by window.sessionStorage.
 * - Persists across route changes / component remounts in the same tab
 * - Clears automatically when the tab/window is closed
 */
export function useSessionStorageState<T>(
  key: string,
  defaultValue: T,
  options?: {
    serialize?: Serializer<T>;
    deserialize?: Deserializer<T>;
  }
) {
  const serialize: Serializer<T> = options?.serialize ?? ((v) => JSON.stringify(v));
  const deserialize: Deserializer<T> =
    options?.deserialize ??
    ((raw) => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // If it isn't JSON, treat it as a primitive string.
        return raw as unknown as T;
      }
    });

  const read = (): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw == null) return defaultValue;
      return deserialize(raw);
    } catch {
      return defaultValue;
    }
  };

  const [value, setValue] = useState<T>(() => read());

  // If the key changes (e.g. episodeId changes), re-read from storage.
  useEffect(() => {
    setValue(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, serialize(value));
    } catch {
      // Ignore quota / privacy mode errors
    }
  }, [key, value, serialize]);

  return [value, setValue] as const;
}


