export interface CompanyBillingDetails {
  companyName: string;
  abn: string;
  phone: string;
  companyAddress: string;
  paymentAccountName: string;
  bsb: string;
  accountNumber: string;
}

export const DEFAULT_COMPANY_BILLING_DETAILS: CompanyBillingDetails = {
  companyName: 'Null Device',
  abn: 'ABN 93 374 916 783',
  phone: '+61 406 199 785',
  companyAddress: '31 Chester Street, Epping NSW 2121',
  paymentAccountName: 'Null Device',
  bsb: '000-000',
  accountNumber: '00000000',
};
