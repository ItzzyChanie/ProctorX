import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query and re-renders when it starts/stops matching. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Phones and portrait tablets: the sidebar becomes an off-canvas drawer. */
export const DRAWER_QUERY = '(max-width: 1023px)';

/** Phones (below Tailwind's `sm` breakpoint). */
export const PHONE_QUERY = '(max-width: 639px)';
export const useIsPhone = () => useMediaQuery(PHONE_QUERY);
