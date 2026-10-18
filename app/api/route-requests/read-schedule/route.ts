import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { extractPdfLayoutText } from '@/lib/server/pdfLayoutText';
import { readRouteRequestFile } from '@/lib/server/reportStorage';
import { askScheduleModel } from '@/lib/server/scheduleModel';
import { scheduleAttachmentIndex } from '@/lib/routeRequests';
import { buildSchedulePrompt, parseScheduleReading, SCHEDULE_SYSTEM_PROMPT } from '@/lib/scheduleReading';

// A sheet with fewer characters than this has no text layer worth reading.
const MIN_SHEET_TEXT = 20;

const isPdf = (attachment: { filename: string; contentType?: string | null }) =>
  /pdf/i.test(attachment.contentType ?? '') || /\.pdf$/i.test(attachment.filename);
const isPlainText = (attachment: { filename: string; contentType?: string | null }) =>
  /^text\//i.test(attachment.contentType ?? '') || /\.(csv|txt)$/i.test(attachment.filename);

/**
 * Reads a Route Request's Schedule into rows (ADR 0014): body { requestId,
 * attachmentIndex?, force? }. Administrators only. The sheet's layout-preserving
 * text and the email's body go to the model, and the rows come back as a proposal
 * stored on the record, so asking again returns the stored reading without
 * another model call unless `force` is set. Nothing about a Route changes.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
    }

    const { data: record, errors } = await auth.client.models.RouteRequestRecord.get({ id: requestId });
    if (errors?.length) {
      console.error('Reading the Route Request failed:', errors);
      return NextResponse.json({ error: 'Could not read the Schedule' }, { status: 500 });
    }
    if (!record) {
      return NextResponse.json({ error: 'Route Request not found' }, { status: 404 });
    }

    if (record.scheduleReading && body.force !== true) {
      return NextResponse.json({ reading: record.scheduleReading, cached: true });
    }

    const index = Number.isInteger(body.attachmentIndex) ? body.attachmentIndex : scheduleAttachmentIndex(record.attachments);
    const attachment = index === null ? null : record.attachments?.[index];
    if (index === null || !attachment) {
      return NextResponse.json({ error: 'This Route Request has no Schedule attached. Enter the Stops by hand.' }, { status: 422 });
    }

    let sheetText: string;
    if (isPdf(attachment)) {
      sheetText = await extractPdfLayoutText(await readRouteRequestFile(attachment.key));
    } else if (isPlainText(attachment)) {
      sheetText = new TextDecoder().decode(await readRouteRequestFile(attachment.key));
    } else {
      return NextResponse.json({ error: `${attachment.filename} is not a PDF or text file. Enter the Stops by hand.` }, { status: 422 });
    }
    if (sheetText.trim().length < MIN_SHEET_TEXT) {
      // A scan: nothing to read, so nothing goes to the model.
      return NextResponse.json({ error: `${attachment.filename} has no text to read (it may be a scan). Enter the Stops by hand.` }, { status: 422 });
    }

    const answer = await askScheduleModel({
      system: SCHEDULE_SYSTEM_PROMPT,
      prompt: buildSchedulePrompt({ sheetText, emailBody: record.bodyText, filename: attachment.filename }),
      maxTokens: 16000,
    });
    const parsed = parseScheduleReading(answer);

    const reading = {
      readAt: new Date().toISOString(),
      readBySub: auth.claims.sub,
      attachmentIndex: index,
      ...(parsed.sheetDate && { sheetDate: parsed.sheetDate }),
      rows: parsed.rows,
      warnings: parsed.warnings,
    };
    const { errors: updateErrors } = await auth.client.models.RouteRequestRecord.update({ id: requestId, scheduleReading: reading });
    if (updateErrors?.length) {
      console.error('Saving the Schedule reading failed:', updateErrors);
      return NextResponse.json({ error: 'Read the Schedule but could not save it' }, { status: 500 });
    }
    return NextResponse.json({ reading, cached: false });
  } catch (err) {
    console.error('Reading the Schedule failed:', err);
    return NextResponse.json({ error: 'Could not read the Schedule' }, { status: 502 });
  }
}
