import { NO_MOBILE_REASON, notifyOperatorOutcome } from './notifyOperatorOutcome';

const emailSent = { status: 'sent' as const, to: 'jane@nulldevice.dev' };

describe('notifyOperatorOutcome', () => {
  it('is a success naming both when the email and the text went out', () => {
    expect(notifyOperatorOutcome({ email: emailSent, text: { status: 'sent', to: '0412 345 678' } })).toEqual({
      tone: 'success',
      message: 'Notified jane@nulldevice.dev and 0412 345 678.',
    });
  });

  it('is still a success when the Operator has no mobile, and says no text went', () => {
    expect(notifyOperatorOutcome({ email: emailSent, text: { status: 'skipped', reason: NO_MOBILE_REASON } })).toEqual({
      tone: 'success',
      message: `Notified jane@nulldevice.dev. ${NO_MOBILE_REASON}.`,
    });
  });

  it('is a warning when the text was skipped for another reason or failed', () => {
    const outcome = notifyOperatorOutcome({
      email: emailSent,
      text: { status: 'failed', reason: 'Text not sent: Destination phone number not verified' },
    });
    expect(outcome).toEqual({
      tone: 'warning',
      message: 'Notified jane@nulldevice.dev. Text not sent: Destination phone number not verified.',
    });
  });

  it('is a warning when only the text went out', () => {
    const outcome = notifyOperatorOutcome({
      email: { status: 'failed', reason: 'Email not sent: Template does not exist' },
      text: { status: 'sent', to: '0412 345 678' },
    });
    expect(outcome).toEqual({
      tone: 'warning',
      message: 'Notified 0412 345 678. Email not sent: Template does not exist.',
    });
  });
});
