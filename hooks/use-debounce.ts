"use client";

import { useEffect, useState } from "react";

/** Debounced copy of a value. Used for search inputs that drive Convex queries. */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

type DebouncedCallback<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
  flush: () => void;
};

/**
 * Debounced callback with a stable identity.
 * The latest callback is kept in a closure owned by the hook's state so the
 * timer does not reset every render, which is what makes this usable for
 * autosave.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 500,
): DebouncedCallback<Args> {
  const [controller] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Args | null = null;
    let latestCallback = callback;
    let wait = delay;

    const debounced = Object.assign(
      (...args: Args) => {
        lastArgs = args;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          latestCallback(...args);
        }, wait);
      },
      {
        cancel: () => {
          if (timer) clearTimeout(timer);
          timer = null;
        },
        flush: () => {
          if (timer && lastArgs) {
            clearTimeout(timer);
            timer = null;
            latestCallback(...lastArgs);
          }
        },
      },
    );

    return {
      debounced,
      update: (nextCallback: (...args: Args) => void, nextDelay: number) => {
        latestCallback = nextCallback;
        wait = nextDelay;
      },
    };
  });

  useEffect(() => {
    controller.update(callback, delay);
  }, [controller, callback, delay]);

  useEffect(() => {
    return () => controller.debounced.cancel();
  }, [controller]);

  return controller.debounced;
}
