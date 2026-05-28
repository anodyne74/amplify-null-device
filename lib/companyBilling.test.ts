import { DEFAULT_COMPANY_BILLING_DETAILS } from './companyBilling';

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
