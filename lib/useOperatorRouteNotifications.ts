'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/app/components/ToastProvider';
import { useLiveOperatorRoutes } from '@/lib/useLiveRoutes';
import type { Route } from '@/amplify/types';

interface RouteSnapshot {
  customerInstructions: string;
}

function toSnapshot(route: Route): RouteSnapshot {
  return { customerInstructions: route.customerInstructions ?? '' };
}

function routeLabel(route: Route): string {
  return route.routeCode || route.id.slice(0, 8);
}

/**
 * Shows an in-app toast to the signed-in operator when a route becomes newly
 * assigned to them, or when a customer adds/changes instructions on a route
 * already assigned to them — regardless of which operator-portal screen is
 * open. Mounted once in the operator layout so it stays live app-wide; a
 * separate concern from the per-screen live-update hooks in
 * lib/useLiveRoutes.ts (#271), which only keep an already-open screen current.
 *
 * The first synced snapshot after (re)subscribing establishes a baseline
 * without toasting, so existing assignments never fire on login, and a
 * dropped/reconnected subscription doesn't retroactively toast for changes
 * missed while offline.
 */
export function useOperatorRouteNotifications(operatorSub: string | null): void {
  const { showToast } = useToast();
  const { routes, loading } = useLiveOperatorRoutes(operatorSub);
  const previousRef = useRef<Map<string, RouteSnapshot> | null>(null);
  const awaitingBaselineRef = useRef(true);

  useEffect(() => {
    if (loading) {
      awaitingBaselineRef.current = true;
      return;
    }

    if (awaitingBaselineRef.current) {
      awaitingBaselineRef.current = false;
      previousRef.current = new Map(routes.map((route) => [route.id, toSnapshot(route)]));
      return;
    }

    const previous = previousRef.current ?? new Map<string, RouteSnapshot>();
    for (const route of routes) {
      const before = previous.get(route.id);
      if (!before) {
        showToast(`Route ${routeLabel(route)} has been assigned to you`);
      } else if (before.customerInstructions !== (route.customerInstructions ?? '')) {
        showToast(`New instructions on route ${routeLabel(route)}`);
      }
    }

    previousRef.current = new Map(routes.map((route) => [route.id, toSnapshot(route)]));
  }, [routes, loading, showToast]);
}
