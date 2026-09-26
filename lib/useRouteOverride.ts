'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Route } from '@/amplify/types';
import { updateRoute } from '@/lib/routes';

type RouteUpdatePayload = Parameters<typeof updateRoute>[1];

interface UseRouteOverrideOptions<TValues> {
  route: Route | null;
  refetchRoute: () => Promise<void>;
  /** Recomputed on every qualifying render — this seam reseeds `values` from it
   * for as long as the caller hasn't started editing, so data that resolves
   * after first mount (customer rate, stop totals) doesn't get stuck behind a
   * stale initial value. Ignored once the caller has started editing, and
   * again after that route id changes. */
  computeDefaults: () => TValues;
  /** Maps this adapter's editable values onto the Route override fields it
   * owns. The hook itself never names a Route field. */
  buildPayload: (values: TValues) => RouteUpdatePayload;
  /** Optional pre-save check; a returned string blocks the save and surfaces
   * as `error` instead. */
  validate?: (values: TValues) => string | null;
  errorMessage?: string;
  successMessage?: string;
}

interface UseRouteOverrideResult<TValues> {
  values: TValues;
  setValues: (updater: TValues | ((current: TValues) => TValues)) => void;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  save: () => Promise<boolean>;
}

const DEFAULT_ERROR_MESSAGE = 'Failed to save changes.';

/**
 * Shared editable-override engine behind the administrator Route Detail
 * "Invoice Values" panel and the operator Route Detail distance override:
 * seed local values from a computed default, track whether the caller has
 * started editing, and save via updateRoute()/refetchRoute() with a single
 * error/success path. Each adapter supplies its own field shape, default
 * computation, and Route-field mapping — this hook knows neither.
 */
export function useRouteOverride<TValues>({
  route,
  refetchRoute,
  computeDefaults,
  buildPayload,
  validate,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  successMessage,
}: UseRouteOverrideOptions<TValues>): UseRouteOverrideResult<TValues> {
  const [values, setValuesState] = useState<TValues>(computeDefaults);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const routeIdRef = useRef(route?.id);

  useEffect(() => {
    const routeChanged = route?.id !== routeIdRef.current;
    routeIdRef.current = route?.id;

    if (routeChanged) {
      setDirty(false);
      setValuesState(computeDefaults());
      return;
    }

    if (!dirty) {
      setValuesState(computeDefaults());
    }
    // computeDefaults is passed fresh on every render by callers — deliberately
    // not a dependency, since route identity/dirty are what should trigger a
    // reseed, mirroring useSignRunPhaseScreen/useCustomerPortalContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, dirty]);

  const setValues = useCallback((updater: TValues | ((current: TValues) => TValues)) => {
    setDirty(true);
    setError(null);
    setSuccess(null);
    setValuesState((current) =>
      typeof updater === 'function' ? (updater as (current: TValues) => TValues)(current) : updater
    );
  }, []);

  const save = useCallback(async () => {
    if (!route) return false;

    const validationError = validate?.(values);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return false;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { errors } = await updateRoute(route.id, buildPayload(values));
      if (errors && errors.length > 0) {
        setError(errorMessage);
        return false;
      }
      await refetchRoute();
      setDirty(false);
      if (successMessage) setSuccess(successMessage);
      return true;
    } catch {
      setError(errorMessage);
      return false;
    } finally {
      setSaving(false);
    }
  }, [route, validate, values, buildPayload, errorMessage, successMessage, refetchRoute]);

  return { values, setValues, dirty, saving, error, success, save };
}
