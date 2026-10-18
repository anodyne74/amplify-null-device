import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { askScheduleModel } from '@/lib/server/scheduleModel';

/**
 * Makes one small call to the model that reads Route Request Schedules (ADR
 * 0014) and says whether it answered, so a deploy can be checked end to end:
 * the SSR role's Bedrock grant, the model being enabled for the account, and
 * BEDROCK_SCHEDULE_MODEL_ID. Administrators only. It reads and writes no data.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const answer = await askScheduleModel({
      system: 'You answer with exactly one word and nothing else.',
      prompt: 'Reply with the word OK.',
      maxTokens: 16,
    });
    return NextResponse.json({ ok: true, answer: answer.trim(), modelId: process.env.BEDROCK_SCHEDULE_MODEL_ID });
  } catch (err) {
    // The name tells AccessDeniedException (no grant) from ValidationException (a model that isn't enabled) apart.
    const name = err instanceof Error ? err.name : 'Error';
    console.error('Checking the Schedule model failed:', err);
    return NextResponse.json({ ok: false, error: `The Schedule model did not answer (${name})` }, { status: 502 });
  }
}
