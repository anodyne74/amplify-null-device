/**
 * The text Notify Operator sends (#423). It always fits in one SMS: at most
 * 160 characters from the basic SMS (GSM-7) alphabet -- one character outside
 * it, like an emoji, a curly quote or `…`, drops the limit to 70. When it
 * wouldn't fit, only the Customer's name is shortened.
 */
export const SMS_MAX_LENGTH = 160;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GSM 03.38 basic character set, without its extension table (whose
// characters count twice).
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;

export function isSingleSms(text: string): boolean {
  return text.length <= SMS_MAX_LENGTH && GSM7.test(text);
}

/** `2026-10-07` → `Tue 7 Oct`; a Route with no date is `date to be confirmed`. */
export function textDate(scheduledDate: string | null | undefined): string {
  const match = scheduledDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate) : null;
  if (!match) return 'date to be confirmed';
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** Characters outside the basic SMS alphabet, swapped for their nearest plain ones or dropped. */
function plainSmsText(value: string): string {
  return [...value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')]
    .filter((ch) => GSM7.test(ch) && ch !== '\n' && ch !== '\r')
    .join('');
}

export interface NotifyOperatorTextInput {
  routeCode: string;
  customerName: string;
  stopCount: number;
  scheduledDate?: string | null;
  /** The short link to the Route, `https://<domain>/r/<Route id>`. */
  routeLink: string;
}

export function notifyOperatorText(input: NotifyOperatorTextInput): string {
  const stops = `${input.stopCount} ${input.stopCount === 1 ? 'stop' : 'stops'}`;
  const write = (customer: string) =>
    `NullDevice: Route ${plainSmsText(input.routeCode)} for ${customer}, ${stops}, ${textDate(input.scheduledDate)}. ${input.routeLink}`;

  const customer = plainSmsText(input.customerName).trim() || 'a customer';
  const full = write(customer);
  if (full.length <= SMS_MAX_LENGTH) return full;

  const room = customer.length - (full.length - SMS_MAX_LENGTH) - '...'.length;
  return write(`${customer.slice(0, Math.max(room, 1)).trimEnd()}...`);
}
