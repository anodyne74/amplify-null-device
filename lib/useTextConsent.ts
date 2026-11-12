'use client';

import { useCallback, useEffect, useState } from 'react';
import { australianMobile } from '@/lib/operatorMobile';
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import {
  effectiveTextConsent,
  shouldAskTextConsent,
  type TextConsentAnswer,
  type TextConsentRecord,
  type TextConsentState,
} from '@/lib/textConsent';

export interface TextConsent {
  /** 'loading' until read; 'error' if it couldn't be -- never guess an answer. */
  status: 'loading' | 'ready' | 'error';
  state: TextConsentState;
  /** Whether the Operator has an Australian mobile a yes could be recorded against. */
  hasMobile: boolean;
  /** True when the question should be put to them now (see shouldAskTextConsent). */
  shouldAsk: boolean;
  saving: boolean;
  saveError: string | null;
  /** Records the answer through the server route; resolves true once it is saved. */
  answer: (consent: TextConsentAnswer) => Promise<boolean>;
}

/**
 * The signed-in Operator's own Text Consent (CONTEXT.md, ADR 0016): read from
 * their Operator and OperatorTextConsent records, written only through
 * /api/operator/text-consent.
 */
export function useTextConsent(operatorId: string | undefined): TextConsent {
  const [record, setRecord] = useState<TextConsentRecord | null>(null);
  const [status, setStatus] = useState<TextConsent['status']>('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const models = getDataClient().models;
    const [operator, consent] = await Promise.all([
      models.Operator.get({ id }),
      models.OperatorTextConsent.get({ id }),
    ]);
    if (operator.errors?.length || consent.errors?.length || !operator.data) {
      throw new Error('Could not read Text Consent');
    }
    return {
      id,
      phone: operator.data.phone,
      textConsent: consent.data?.textConsent as TextConsentAnswer | null | undefined,
      textConsentMobile: consent.data?.textConsentMobile,
    } satisfies TextConsentRecord;
  }, []);

  useEffect(() => {
    if (!operatorId) return;
    let cancelled = false;
    setStatus('loading');
    load(operatorId).then(
      (loaded) => {
        if (cancelled) return;
        setRecord(loaded);
        setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [operatorId, load]);

  const answer = useCallback(
    async (consent: TextConsentAnswer) => {
      if (!operatorId) return false;
      setSaving(true);
      setSaveError(null);
      try {
        await callApi('/api/operator/text-consent', { consent });
        setRecord(await load(operatorId));
        return true;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save your answer.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [operatorId, load]
  );

  const ready = status === 'ready' && record !== null;
  return {
    status,
    state: ready ? effectiveTextConsent(record) : 'unset',
    hasMobile: ready && australianMobile(record.phone) !== null,
    shouldAsk: ready && shouldAskTextConsent(record),
    saving,
    saveError,
    answer,
  };
}
