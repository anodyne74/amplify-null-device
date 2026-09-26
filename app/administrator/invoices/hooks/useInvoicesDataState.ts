import { useCallback, useMemo, useState } from 'react';
import type { Route } from '@/amplify/types';
import type { CustomerOption, Invoice } from '@/app/administrator/invoices/types';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listCustomerUsers, listCustomers, listInvoices } from '@/lib/queries';

type UseInvoicesDataStateParams = {
  customerId: string;
  setCustomerId: (value: string) => void;
  setError: (value: string | null) => void;
  setLoading: (value: boolean) => void;
};

export function useInvoicesDataState({
  customerId,
  setCustomerId,
  setError,
  setLoading,
}: UseInvoicesDataStateParams) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const sortedInvoices = useMemo(() => {
    return [...invoices].sort((left, right) => {
      const leftTimestamp = Date.parse(left.invoiceDate ?? left.createdAt ?? '');
      const rightTimestamp = Date.parse(right.invoiceDate ?? right.createdAt ?? '');

      if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return (right.invoiceNumber ?? '').localeCompare(left.invoiceNumber ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, [invoices]);

  const updateInvoiceInState = useCallback((invoiceId: string, updates: Partial<Invoice>) => {
    setInvoices((prev) =>
      prev.map((invoice) => (invoice.id === invoiceId ? { ...invoice, ...updates } : invoice))
    );
  }, []);

  const updateCustomerInState = useCallback((customerIdToUpdate: string, updates: Partial<CustomerOption>) => {
    setCustomers((prev) =>
      prev.map((customer) => (customer.id === customerIdToUpdate ? { ...customer, ...updates } : customer))
    );
  }, []);

  const removeInvoiceFromState = useCallback((invoiceId: string) => {
    setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [customersResult, invoicesResult, routesResult] = await Promise.all([
      listCustomers(),
      listInvoices(),
      listAllRoutes(),
    ]);

    if (customersResult.errors && customersResult.errors.length > 0) {
      setError('Failed to load customers.');
    } else {
      const mapped = ((customersResult.data as Array<{
        id: string;
        name: string;
        email?: string;
        addressLine1?: string;
        billingRatePerHour?: number;
        gstExclusive?: boolean | null;
        viewerSubs?: string[] | null;
        driverSplitPercent?: number | null;
        groupLineItemsByAgent?: boolean | null;
        paymentTermsDays?: number | null;
      }>) || []).map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        addressLine1: customer.addressLine1,
        billingRatePerHour: customer.billingRatePerHour,
        gstExclusive: customer.gstExclusive,
        viewerSubs: customer.viewerSubs,
        driverSplitPercent: customer.driverSplitPercent,
        groupLineItemsByAgent: customer.groupLineItemsByAgent,
        paymentTermsDays: customer.paymentTermsDays,
      }));

      const customersWithPrimary = await Promise.all(
        mapped.map(async (customer) => {
          const usersResult = await listCustomerUsers(customer.id);
          const customerUsers = (usersResult.data as Array<{ role?: string | null; email?: string | null }> | undefined) || [];
          const owner = customerUsers.find((row) => row.role === 'account_owner' && row.email);
          return {
            ...customer,
            primaryEmail: owner?.email ?? customer.email,
          };
        })
      );

      setCustomers(customersWithPrimary);
      if (!customerId && customersWithPrimary.length > 0) setCustomerId(customersWithPrimary[0].id);
    }

    if (!routesResult.errors || routesResult.errors.length === 0) {
      setRoutes((routesResult.data as Route[]) || []);
    }

    if (invoicesResult.errors && invoicesResult.errors.length > 0) {
      setError('Failed to load invoices.');
    } else {
      setInvoices((invoicesResult.data as Invoice[]) ?? []);
    }

    setLoading(false);
  }, [customerId, setCustomerId, setError, setLoading]);

  return {
    customers,
    routes,
    invoices,
    sortedInvoices,
    fetchData,
    updateInvoiceInState,
    removeInvoiceFromState,
    updateCustomerInState,
  };
}