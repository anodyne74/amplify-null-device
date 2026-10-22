'use client';

import { useEffect, useState } from 'react';
import { getRouteIdByLinkCode } from '@/lib/routes';

/**
 * The Route a page was opened on: `?id=` is the Route itself, `?code=` is a
 * Route Link code (CONTEXT.md) looked up under the signed-in user. An unknown
 * or unreadable code gives an empty id, which screens show as a Route that
 * isn't there, the same as an unknown id.
 */
export function useRouteIdFromLink(id: string, code: string): { routeId: string; resolving: boolean } {
  const [found, setFound] = useState<{ code: string; id: string } | null>(null);
  const lookingUp = !id && Boolean(code);

  useEffect(() => {
    if (!lookingUp) return;
    let cancelled = false;
    getRouteIdByLinkCode(code)
      .catch((error) => {
        console.warn('Could not look up the Route Link:', error);
        return null;
      })
      .then((routeId) => {
        if (!cancelled) setFound({ code, id: routeId ?? '' });
      });
    return () => {
      cancelled = true;
    };
  }, [lookingUp, code]);

  if (!lookingUp) return { routeId: id, resolving: false };
  if (found?.code !== code) return { routeId: '', resolving: true };
  return { routeId: found.id, resolving: false };
}
