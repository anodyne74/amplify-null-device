import { effectiveTextConsent, planTextConsentChange, shouldAskTextConsent, NO_CONSENT_REASON } from './textConsent';

const NOW = '2026-11-13T01:00:00.000Z';
const base = { id: 'op-1', phone: '+61412345678' };

describe('effectiveTextConsent', () => {
  it('is unset for an Operator who has never answered', () => {
    expect(effectiveTextConsent(base)).toBe('unset');
  });

  it('is the stored answer while the mobile is the one it was given for', () => {
    expect(effectiveTextConsent({ ...base, textConsent: 'yes', textConsentMobile: '+61412345678' })).toBe('yes');
    expect(effectiveTextConsent({ ...base, textConsent: 'no', textConsentMobile: '+61412345678' })).toBe('no');
  });

  it('ignores how the number is written', () => {
    expect(effectiveTextConsent({ id: 'op-1', phone: '0412 345 678', textConsent: 'yes', textConsentMobile: '+61412345678' })).toBe('yes');
  });

  it('goes back to unset when the mobile is replaced or removed', () => {
    expect(effectiveTextConsent({ ...base, phone: '0499 999 999', textConsent: 'yes', textConsentMobile: '+61412345678' })).toBe('unset');
    expect(effectiveTextConsent({ ...base, phone: null, textConsent: 'no', textConsentMobile: '+61412345678' })).toBe('unset');
  });

  it('treats an answer with no recorded mobile as unset', () => {
    expect(effectiveTextConsent({ ...base, textConsent: 'yes' })).toBe('unset');
  });
});

describe('planTextConsentChange', () => {
  const operator = (self: boolean) => ({ sub: self ? 'op-1' : 'op-2', administrator: false });
  const admin = { sub: 'admin-1', administrator: true };

  it('lets an Operator answer for themselves', () => {
    const plan = planTextConsentChange({ caller: operator(true), operator: base, consent: 'yes', now: NOW });
    expect(plan).toEqual({
      ok: true,
      next: { textConsent: 'yes', textConsentAt: NOW, textConsentMobile: '+61412345678' },
      details: { previous: 'unset', next: 'yes', by: 'operator' },
    });
  });

  it('refuses an Operator answering for someone else', () => {
    expect(planTextConsentChange({ caller: operator(false), operator: base, consent: 'no', now: NOW })).toEqual({
      ok: false, status: 403, error: 'You can only change your own answer',
    });
  });

  it('lets an administrator turn it off without a record', () => {
    const plan = planTextConsentChange({
      caller: admin, operator: { ...base, textConsent: 'yes', textConsentMobile: '+61412345678' }, consent: 'no', now: NOW,
    });
    expect(plan).toMatchObject({ ok: true, details: { previous: 'yes', next: 'no', by: 'administrator' } });
  });

  it('lets an administrator turn it on only with the Operator having agreed', () => {
    expect(planTextConsentChange({ caller: admin, operator: base, consent: 'yes', now: NOW })).toEqual({
      ok: false, status: 400, error: 'Confirm that the Operator agreed to texts',
    });
    expect(planTextConsentChange({ caller: admin, operator: base, consent: 'yes', operatorAgreed: true, now: NOW })).toMatchObject({
      ok: true, details: { previous: 'unset', next: 'yes', by: 'administrator', operatorAgreed: true },
    });
  });

  it('needs an Australian mobile on file to say yes to', () => {
    expect(planTextConsentChange({ caller: operator(true), operator: { id: 'op-1', phone: null }, consent: 'yes', now: NOW })).toEqual({
      ok: false, status: 400, error: NO_CONSENT_REASON.noMobile,
    });
    expect(planTextConsentChange({ caller: operator(true), operator: { id: 'op-1', phone: '02 9876 5432' }, consent: 'yes', now: NOW })).toMatchObject({ ok: false, status: 400 });
  });

  it('records no without needing a mobile', () => {
    expect(planTextConsentChange({ caller: operator(true), operator: { id: 'op-1', phone: null }, consent: 'no', now: NOW })).toMatchObject({
      ok: true, next: { textConsent: 'no' },
    });
  });

  it('reports the previous answer as unset after the mobile changed', () => {
    const plan = planTextConsentChange({
      caller: operator(true), operator: { id: 'op-1', phone: '0499 999 999', textConsent: 'yes', textConsentMobile: '+61412345678' }, consent: 'yes', now: NOW,
    });
    expect(plan).toMatchObject({ ok: true, details: { previous: 'unset' }, next: { textConsentMobile: '+61499999999' } });
  });
});

describe('shouldAskTextConsent', () => {
  it('asks an Operator with a mobile who has not answered', () => {
    expect(shouldAskTextConsent(base)).toBe(true);
  });

  it('asks again when the number changed since the answer', () => {
    expect(shouldAskTextConsent({ ...base, phone: '0499 999 999', textConsent: 'yes', textConsentMobile: '+61412345678' })).toBe(true);
  });

  it('never asks an Operator who has answered, yes or no', () => {
    expect(shouldAskTextConsent({ ...base, textConsent: 'yes', textConsentMobile: '+61412345678' })).toBe(false);
    expect(shouldAskTextConsent({ ...base, textConsent: 'no', textConsentMobile: '+61412345678' })).toBe(false);
  });

  it('does not ask an Operator with no Australian mobile, who cannot be texted', () => {
    expect(shouldAskTextConsent({ id: 'op-1', phone: null })).toBe(false);
    expect(shouldAskTextConsent({ id: 'op-1', phone: '02 9999 9999' })).toBe(false);
  });
});
