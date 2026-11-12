/**
 * Text Consent (CONTEXT.md, ADR 0016): an Operator's yes or no to Notify
 * Operator texts. It belongs to the mobile number it was given for, so what
 * counts is `effectiveTextConsent()`, never the stored answer alone: the
 * answer stands only while the Operator's mobile is the one recorded with it.
 * A replaced or removed number therefore takes the Operator back to unset
 * without anything having to notice the number changed.
 */
import { australianMobile } from './operatorMobile';

export type TextConsentAnswer = 'yes' | 'no';
export type TextConsentState = TextConsentAnswer | 'unset';

export interface TextConsentRecord {
  id: string;
  phone?: string | null;
  textConsent?: TextConsentAnswer | null;
  textConsentMobile?: string | null;
}

export const NO_CONSENT_REASON = {
  /** The skipped-text reason Notify Operator shows. */
  notAgreed: "Text not sent: the Operator hasn't agreed to texts",
  noMobile: 'Add an Australian mobile number before recording a yes',
};

export function effectiveTextConsent(operator: Omit<TextConsentRecord, 'id'> & { id?: string }): TextConsentState {
  const answer = operator.textConsent;
  if (answer !== 'yes' && answer !== 'no') return 'unset';
  const current = australianMobile(operator.phone)?.international;
  const given = australianMobile(operator.textConsentMobile)?.international;
  return current && current === given ? answer : 'unset';
}

export interface TextConsentChangeInput {
  caller: { sub: string; administrator: boolean };
  operator: TextConsentRecord;
  consent: TextConsentAnswer;
  /** An administrator saying the Operator agreed to them directly; needed to turn it on. */
  operatorAgreed?: boolean;
  now: string;
}

export type TextConsentPlan =
  | {
      ok: true;
      next: { textConsent: TextConsentAnswer; textConsentAt: string; textConsentMobile: string };
      details: { previous: TextConsentState; next: TextConsentAnswer; by: 'operator' | 'administrator'; operatorAgreed?: true };
    }
  | { ok: false; status: 400 | 403; error: string };

export function planTextConsentChange({ caller, operator, consent, operatorAgreed, now }: TextConsentChangeInput): TextConsentPlan {
  const administrator = caller.administrator;
  if (!administrator && caller.sub !== operator.id) {
    return { ok: false, status: 403, error: 'You can only change your own answer' };
  }
  if (administrator && consent === 'yes' && operatorAgreed !== true) {
    return { ok: false, status: 400, error: 'Confirm that the Operator agreed to texts' };
  }
  const mobile = australianMobile(operator.phone);
  if (consent === 'yes' && !mobile) {
    return { ok: false, status: 400, error: NO_CONSENT_REASON.noMobile };
  }
  return {
    ok: true,
    next: {
      textConsent: consent,
      textConsentAt: now,
      // A no without a mobile is held against no number, so it reads as unset once one is added.
      textConsentMobile: mobile?.international ?? '',
    },
    details: {
      previous: effectiveTextConsent(operator),
      next: consent,
      by: administrator ? 'administrator' : 'operator',
      ...(administrator && consent === 'yes' ? { operatorAgreed: true as const } : {}),
    },
  };
}
