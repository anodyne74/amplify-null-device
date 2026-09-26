import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import {
  FEATURE_FLAG_STATES,
  isFeatureFlagName,
  type FeatureFlagChange,
  type FeatureFlagSettingRecord,
  type FeatureFlagState,
} from '@/lib/featureFlags';
import { planFeatureFlagChange } from '@/lib/server/featureFlags';

/**
 * Changes one Feature Flag (ADR 0005): its state, its Selected Customers list,
 * or clearing that list. Every change writes the setting and exactly one
 * AuditLog entry together -- if the audit entry can't be written the setting
 * is put back, so no change goes unrecorded. Administrators can only read
 * FeatureFlagSetting through AppSync; this route is the only way to write it.
 *
 * Body: { name, action: 'set-state', state } | { name, action: 'set-customers', customerIds }
 *     | { name, action: 'clear-customers' }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'administrator');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const body = (await request.json()) as Record<string, unknown>;
    const { name } = body;
    if (!isFeatureFlagName(name)) {
      return NextResponse.json({ error: 'Unknown feature flag' }, { status: 400 });
    }
    const change = parseChange(body);
    if (!change) {
      return NextResponse.json({ error: 'Invalid feature flag change' }, { status: 400 });
    }

    const { data: current, errors: readErrors } = await client.models.FeatureFlagSetting.get({ id: name });
    if (readErrors?.length) {
      console.error('Reading feature flag setting failed:', readErrors);
      return NextResponse.json({ error: 'Could not read the feature flag' }, { status: 500 });
    }

    const plan = planFeatureFlagChange(current as FeatureFlagSettingRecord | null, change, new Date().toISOString());
    if (!plan) {
      return NextResponse.json({ changed: false, setting: current });
    }

    const input = { id: name, ...plan.next, updatedBy: claims.sub };
    const { data: written, errors: writeErrors } = current
      ? await client.models.FeatureFlagSetting.update(input)
      : await client.models.FeatureFlagSetting.create(input);
    if (writeErrors?.length || !written) {
      console.error('Writing feature flag setting failed:', writeErrors);
      return NextResponse.json({ error: 'Could not save the feature flag' }, { status: 500 });
    }

    const { errors: auditErrors } = await client.models.AuditLog.create({
      operatorId: claims.sub,
      eventType: 'data_modification',
      resourceType: 'feature_flag',
      resourceId: name,
      action: `feature_flag.${change.action}`,
      status: 'success',
      timestamp: new Date().toISOString(),
      // a.json() fields travel as a JSON string.
      details: JSON.stringify({ flag: name, ...plan.details }),
    });
    if (auditErrors?.length) {
      console.error('Writing feature flag audit entry failed; undoing the change:', auditErrors);
      const { errors: undoErrors } = current
        ? await client.models.FeatureFlagSetting.update({
            id: name,
            state: current.state,
            selectedCustomerIds: current.selectedCustomerIds,
            everyoneSince: current.everyoneSince,
            updatedBy: current.updatedBy,
          })
        : await client.models.FeatureFlagSetting.delete({ id: name });
      if (undoErrors?.length) {
        console.error('Undoing the unaudited feature flag change failed:', undoErrors);
      }
      return NextResponse.json({ error: 'Could not record the change, so it was not saved' }, { status: 500 });
    }

    return NextResponse.json({ changed: true, setting: written });
  } catch (err) {
    console.error('Unexpected error in admin feature-flags:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}

function parseChange(body: Record<string, unknown>): FeatureFlagChange | null {
  switch (body.action) {
    case 'set-state':
      return FEATURE_FLAG_STATES.includes(body.state as FeatureFlagState)
        ? { action: 'set-state', state: body.state as FeatureFlagState }
        : null;
    case 'set-customers':
      return Array.isArray(body.customerIds) && body.customerIds.every((id) => typeof id === 'string' && id)
        ? { action: 'set-customers', customerIds: body.customerIds as string[] }
        : null;
    case 'clear-customers':
      return { action: 'clear-customers' };
    default:
      return null;
  }
}
