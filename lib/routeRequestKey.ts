/**
 * Where a Route Request record's files are kept in the app bucket. Its own
 * module so the browser can use it without the email parser, and free of `@/`
 * imports so the capture Lambda can too.
 */
/** Where one attachment is kept: requests/<record id>/<position>-<filename>, the name made safe for a key. */
export function requestAttachmentKey(recordId: string, index: number, filename: string): string {
  return `requests/${recordId}/${index}-${filename.replace(/[/\\?#%*:|"<>\u0000-\u001f]/g, '_')}`;
}
