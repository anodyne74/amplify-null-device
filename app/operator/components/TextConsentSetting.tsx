'use client';

import { Field } from '@/app/components/ui/forms/Field';
import { Switch } from '@/app/components/ui/forms/Switch';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { useTextConsent } from '@/lib/useTextConsent';

/** Operator's own switch for texts about their Routes (Text Consent, ADR 0016). */
export function TextConsentSetting() {
  const userId = useCurrentUserId();
  const { status, state, hasMobile, saving, saveError, answer } = useTextConsent(userId);

  let hint = 'We text your mobile when a Route is assigned to you.';
  if (status === 'error') hint = "Couldn't load your answer. Reload to try again.";
  else if (status === 'ready' && !hasMobile) hint = 'Add an Australian mobile number to get texts about your Routes.';
  else if (status === 'ready' && state === 'unset') hint = 'You haven’t answered yet, so we won’t text you.';

  return (
    <Field label="Texts about your Routes" htmlFor="settings-text-consent" hint={hint} error={saveError ?? undefined}>
      <Switch
        id="settings-text-consent"
        checked={state === 'yes'}
        disabled={status !== 'ready' || !hasMobile || saving}
        onChange={(event) => void answer(event.target.checked ? 'yes' : 'no')}
        label={state === 'yes' ? 'On' : 'Off'}
      />
    </Field>
  );
}
