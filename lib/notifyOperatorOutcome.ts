/**
 * What one Notify Operator did, channel by channel, as the edit page reports
 * it: a success when everything that could go out did, a warning when the
 * email or the text didn't.
 */
export type ChannelResult =
  | { status: 'sent'; to: string }
  | { status: 'skipped' | 'failed'; reason: string };

/** Why no text went to an Operator who has no mobile -- the one expected skip. */
export const NO_MOBILE_REASON = 'Text not sent: the Operator has no mobile number';

export interface NotifyOperatorResult {
  email: ChannelResult;
  text: ChannelResult;
}

export function notifyOperatorOutcome({ email, text }: NotifyOperatorResult): {
  tone: 'success' | 'warning';
  message: string;
} {
  const sentTo = [email, text].flatMap((channel) => (channel.status === 'sent' ? [channel.to] : []));
  const notSent = [email, text].flatMap((channel) => (channel.status === 'sent' ? [] : [channel.reason]));
  const message = [`Notified ${sentTo.join(' and ')}.`, ...notSent.map((reason) => `${reason}.`)].join(' ');
  // A text skipped only because the Operator has no mobile is the normal case, not a warning.
  const expected = (channel: ChannelResult) =>
    channel.status === 'sent' || (channel.status === 'skipped' && channel.reason === NO_MOBILE_REASON);
  return { tone: expected(email) && expected(text) ? 'success' : 'warning', message };
}
