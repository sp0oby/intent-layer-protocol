'use client';

import {useEffect, useState} from 'react';

/**
 * Returns the current epoch seconds and re-renders on a tick. React 19's
 * `react-hooks/purity` rule disallows reading Date.now() during render —
 * countdowns and "is the timeout open?" checks need a state-backed clock
 * instead.
 *
 * Defaults to a 1-second tick. Pass a larger interval (e.g. 60_000) for
 * checks that don't need second precision.
 */
export function useNowSeconds(intervalMs: number = 1_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
