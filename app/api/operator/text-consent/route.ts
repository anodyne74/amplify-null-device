import { NextRequest, NextResponse } from 'next/server';
import { recordAudit } from '@/lib/auditLog';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { planTextConsentChange, type TextConsentAnswer } from '@/lib/textConsent';

/**
 * Changes an Operator's Text Consent (CONTEXT.md, ADR 0016). OperatorTextConsent
 * is read-only to clients, so this route is the only way to write it. It decides
 * who may change what (planTextConsentChange), writes the answer and exactly one
 * AuditLog entry together -- if the entry can't be written the answer is put
 * back, so no change goes unrecorded.
 *
 * Body: { consent: 'yes' | 'no', operatorId?, operatorAgreed? }. `operatorId`
 * defaults to the caller; only an administrator may name another Operator, and
 * may turn consent on only with `operatorAgreed`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['operator', 'administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const body = (await request.json()) as Record<string, unknown>;
    const consent = body.consent;
    if (consent !== 'yes' && consent !== 'no') {
      return NextResponse.json({ error: 'consent must be yes or no' }, { status: 400 });
    }
    const administrator = (claims['cognito:groups'] ?? []).includes('administrator');
    const operatorId = typeof body.operatorId === 'string' && body.operatorId ? body.operatorId : claims.sub;
    if (!administrator && operatorId !== claims.sub) {
      return NextResponse.json({ error: 'You can only change your own answer' }, { status: 403 });
    }

    const { data: operator, errors: operatorErrors } = await client.models.Operator.get({ id: operatorId });
    if (operatorErrors?.length) {
      console.error('Reading the Operator failed:', operatorErrors);
      return NextResponse.json({ error: 'Could not read the Operator' }, { status: 500 });
    }
    if (!operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }
    const { data: current, errors: currentErrors } = await client.models.OperatorTextConsent.get({ id: operatorId });
    if (currentErrors?.length) {
      console.error('Reading Text Consent failed:', currentErrors);
      return NextResponse.json({ error: 'Could not read the current answer' }, { status: 500 });
    }

    const plan = planTextConsentChange({
      caller: { sub: claims.sub, administrator },
      operator: {
        id: operatorId,
        phone: operator.phone,
        textConsent: current?.textConsent as TextConsentAnswer | null | undefined,
        textConsentMobile: current?.textConsentMobile,
      },
      consent,
      operatorAgreed: body.operatorAgreed === true,
      now: new Date().toISOString(),
    });
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }

    const input = { id: operatorId, operatorSub: operatorId, ...plan.next };
    const { data: written, errors: writeErrors } = current
      ? await client.models.OperatorTextConsent.update(input)
      : await client.models.OperatorTextConsent.create(input);
    if (writeErrors?.length || !written) {
      console.error('Writing Text Consent failed:', writeErrors);
      return NextResponse.json({ error: 'Could not save the answer' }, { status: 500 });
    }

    const audit = await recordAudit(client, {
      actor: claims.sub,
      eventType: 'data_modification',
      resource: { type: 'operator', id: operatorId },
      action: 'operator.text_consent_changed',
      details: plan.details,
    });
    if (!audit.ok) {
      console.error('Writing the Text Consent audit entry failed; undoing the change:', audit.errors);
      const { errors: undoErrors } = current
        ? await client.models.OperatorTextConsent.update({
            id: operatorId,
            textConsent: current.textConsent,
            textConsentAt: current.textConsentAt,
            textConsentMobile: current.textConsentMobile,
          })
        : await client.models.OperatorTextConsent.delete({ id: operatorId });
      if (undoErrors?.length) {
        console.error('Undoing the unaudited Text Consent change failed:', undoErrors);
      }
      return NextResponse.json({ error: 'Could not record the change, so it was not made' }, { status: 500 });
    }

    return NextResponse.json({ consent: plan.next.textConsent, changedAt: plan.next.textConsentAt });
  } catch (err) {
    console.error('Unexpected error in operator text-consent:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
