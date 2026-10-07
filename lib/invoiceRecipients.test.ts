import { invoiceRecipients } from '@/lib/invoiceRecipients';

describe('invoiceRecipients (#504)', () => {
  it('sends To the Billing email alone when there are no CCs', () => {
    expect(invoiceRecipients({ email: 'billing@acme.test', billingCcEmails: null })).toEqual({ to: 'billing@acme.test', cc: [] });
  });

  it('copies the billing CC addresses', () => {
    expect(
      invoiceRecipients({ email: 'billing@acme.test', billingCcEmails: ['accounts@acme.test', 'pat@acme.test'] })
    ).toEqual({ to: 'billing@acme.test', cc: ['accounts@acme.test', 'pat@acme.test'] });
  });

  it('leaves out a CC that repeats the Billing email in any case', () => {
    expect(invoiceRecipients({ email: 'Billing@Acme.test', billingCcEmails: ['billing@acme.TEST', 'pat@acme.test'] })).toEqual({
      to: 'Billing@Acme.test',
      cc: ['pat@acme.test'],
    });
  });

  it('lists a repeated CC once, whatever its case', () => {
    expect(
      invoiceRecipients({ email: 'billing@acme.test', billingCcEmails: ['pat@acme.test', 'PAT@acme.test', 'pat@acme.test'] })
    ).toEqual({ to: 'billing@acme.test', cc: ['pat@acme.test'] });
  });

  it.each([
    ['null', null],
    ['missing', undefined],
    ['empty', []],
    ['blank entries', ['', '  ', null]],
  ])('has no CCs when billingCcEmails is %s', (_label, billingCcEmails) => {
    expect(invoiceRecipients({ email: 'billing@acme.test', billingCcEmails })).toEqual({ to: 'billing@acme.test', cc: [] });
  });

  it('trims addresses', () => {
    expect(invoiceRecipients({ email: ' billing@acme.test ', billingCcEmails: [' pat@acme.test '] })).toEqual({
      to: 'billing@acme.test',
      cc: ['pat@acme.test'],
    });
  });

  it.each([null, undefined, '  '])('has no To when the Billing email is %p, keeping the CCs', (email) => {
    expect(invoiceRecipients({ email, billingCcEmails: ['pat@acme.test'] })).toEqual({ to: null, cc: ['pat@acme.test'] });
  });
});
