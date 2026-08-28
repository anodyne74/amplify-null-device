import { useEffect, useState } from 'react';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { getOrganizationSettings } from '@/lib/queries/OrganizationSettings';

export function useInvoiceBillingSettings() {
  const [billingCompanyName, setBillingCompanyName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
  const [billingAbn, setBillingAbn] = useState(DEFAULT_COMPANY_BILLING_DETAILS.abn);
  const [billingPhone, setBillingPhone] = useState(DEFAULT_COMPANY_BILLING_DETAILS.phone);
  const [billingCompanyAddress, setBillingCompanyAddress] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
  const [billingPaymentAccountName, setBillingPaymentAccountName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
  const [billingBsb, setBillingBsb] = useState(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
  const [billingAccountNumber, setBillingAccountNumber] = useState(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);

  useEffect(() => {
    let cancelled = false;

    void getOrganizationSettings()
      .then((result) => {
        if (cancelled || !result.data) return;
        setBillingCompanyName(result.data.companyName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyName);
        setBillingAbn(result.data.abn?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.abn);
        setBillingPhone(result.data.phone?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.phone);
        setBillingCompanyAddress(result.data.address?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
        setBillingPaymentAccountName(result.data.paymentAccountName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
        setBillingBsb(result.data.bsb?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.bsb);
        setBillingAccountNumber(result.data.accountNumber?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
      })
      .catch(() => {
        // Non-blocking fallback to defaults.
      });

    return () => { cancelled = true; };
  }, []);

  return {
    billingCompanyName, billingAbn, billingPhone, billingCompanyAddress,
    billingPaymentAccountName, billingBsb, billingAccountNumber,
  };
}
