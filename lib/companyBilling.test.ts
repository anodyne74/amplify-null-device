import { DEFAULT_COMPANY_BILLING_DETAILS, formatAbn } from './companyBilling';

describe('companyBilling defaults', () => {
  it('provides stable default billing details', () => {
    expect(DEFAULT_COMPANY_BILLING_DETAILS).toEqual({
      companyName: 'Null Device',
      abn: 'ABN 93 374 916 783',
      phone: '+61 406 199 785',
      companyAddress: '31 Chester Street, Epping NSW 2121',
      paymentAccountName: 'Null Device',
      bsb: '000-000',
      accountNumber: '00000000',
    });
  });
});

describe('formatAbn', () => {
  it.each(['12 345 678 901', 'ABN 12 345 678 901', 'abn 12 345 678 901', '  ABN12 345 678 901 '])('prefixes %p with ABN exactly once', (value) => {
    expect(formatAbn(value)).toBe('ABN 12 345 678 901');
  });

  it.each(['', '   ', 'ABN', null, undefined])('shows nothing for %p', (value) => {
    expect(formatAbn(value)).toBe('');
  });
});
