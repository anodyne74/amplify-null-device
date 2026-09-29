import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdministratorPropertyHistoryPage from '../page';
import {
  generatePropertyHistoryReport,
  listPropertyHistoryReports,
  listRouteProperties,
  listTypeaheadOptions,
  openPropertyHistoryReport,
  restorePropertyHistoryReport,
  searchPropertyHistory,
} from '@/lib/propertyHistorySearch';
import { listAllCustomers } from '@/lib/customers';
import { buildTypeaheadOptions } from '@/lib/propertyHistoryTypeahead';
import type { PropertyGroup, VisitRow } from '@/lib/propertyHistory';

jest.mock('@/lib/propertyHistorySearch', () => ({
  listTypeaheadOptions: jest.fn(),
  searchPropertyHistory: jest.fn(),
  listRouteProperties: jest.fn(),
  generatePropertyHistoryReport: jest.fn(),
  listPropertyHistoryReports: jest.fn(),
  openPropertyHistoryReport: jest.fn(),
  restorePropertyHistoryReport: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const CLIFF_14 = 'epping|2121|cliff road|14';
const CLIFF_96 = 'epping|2121|cliff road|96';

const OPTIONS = buildTypeaheadOptions([
  { propertyKey: CLIFF_14, address: '14 Cliff Rd, Epping' },
  { propertyKey: CLIFF_96, address: '96 Cliff Rd, Epping' },
]);

function visit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    stopId: 's1',
    routeId: 'r1',
    date: '2026-08-01',
    routeCode: 'W26-08-101',
    agent: 'Betty',
    auction: true,
    signsPlaced: 3,
    invoices: [{ id: 'i1', invoiceNumber: 'INV-0001' }],
    status: 'completed',
    customerName: 'Harcourts Epping',
    operatorName: 'Sam',
    missingSigns: 1,
    locationPrecision: 'approximate',
    ...overrides,
  };
}

function property(propertyKey: string, address: string, overrides: Partial<PropertyGroup> = {}): PropertyGroup {
  return { propertyKey, address, visitCount: 1, visits: [visit()], scheduled: [], ...overrides };
}

const SUBURB_RESULT = {
  level: 'suburb' as const,
  streets: [
    {
      street: 'cliff road',
      properties: [
        property(CLIFF_14, '14 Cliff Rd, Epping', {
          visitCount: 1,
          visits: [visit(), visit({ stopId: 's2', routeId: 'r2', routeCode: 'W26-07-202', status: 'skipped', invoices: [] })],
          scheduled: [visit({ stopId: 's3', routeId: 'r3', routeCode: 'W26-10-303', status: 'planned', invoices: [] })],
        }),
        property(CLIFF_96, '96 Cliff Rd, Epping'),
      ],
    },
  ],
};

async function pick(typed: string, label: RegExp) {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Suburb, street or address' }), { target: { value: typed } });
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('Administrator Property History page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (listTypeaheadOptions as jest.Mock).mockResolvedValue({ data: OPTIONS });
    (listAllCustomers as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'Harcourts Epping' }]);
    (searchPropertyHistory as jest.Mock).mockResolvedValue(SUBURB_RESULT);
    (listRouteProperties as jest.Mock).mockResolvedValue([
      { propertyKey: CLIFF_14, address: '14 Cliff Rd, Epping' },
      { propertyKey: 'epping|2121|pennant street|3', address: '3 Pennant St, Epping' },
    ]);
  });

  it('searches only once a suggestion is picked, with its exact search', async () => {
    render(<AdministratorPropertyHistoryPage />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Suburb, street or address' }), { target: { value: 'cliff' } });

    expect(screen.getByRole('option', { name: /Cliff Road, Epping 2121/ })).toBeInTheDocument();
    expect(searchPropertyHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('option', { name: /Cliff Road, Epping 2121/ }));

    await waitFor(() =>
      expect(searchPropertyHistory).toHaveBeenCalledWith({ level: 'street', suburb: 'epping', postcode: '2121', street: 'cliff road' }, {})
    );
  });

  it('shows collapsible Street and Property groups with Visit counts, Skipped and Scheduled rows', async () => {
    render(<AdministratorPropertyHistoryPage />);
    await pick('epping', /^Epping 2121/);

    const property14 = await screen.findByRole('group', { name: /14 Cliff Rd, Epping/ });
    expect(within(property14).getByText('1 Visit')).toBeInTheDocument();
    expect(within(property14).getByText('Skipped')).toBeInTheDocument();
    expect(within(property14).getByText('Scheduled')).toBeInTheDocument();
    expect(within(property14).getByRole('link', { name: 'W26-10-303' })).toHaveAttribute('href', '/administrator/routes/detail?id=r3');
    expect(screen.getByText('Cliff Road')).toBeInTheDocument();
  });

  it('shows the admin columns and links each row to its Route and Invoices', async () => {
    render(<AdministratorPropertyHistoryPage />);
    await pick('epping', /^Epping 2121/);

    const property14 = await screen.findByRole('group', { name: /14 Cliff Rd, Epping/ });
    const [, firstRow] = within(property14).getAllByRole('row');
    expect(within(firstRow).getByRole('link', { name: 'W26-08-101' })).toHaveAttribute('href', '/administrator/routes/detail?id=r1');
    expect(within(firstRow).getByRole('link', { name: 'INV-0001' })).toHaveAttribute('href', '/administrator/invoices#invoice-i1');
    for (const text of ['Harcourts Epping', 'Sam', 'Approximate', 'Auction']) {
      expect(within(firstRow).getByText(text)).toBeInTheDocument();
    }
    expect(within(property14).getAllByText('Not yet invoiced').length).toBeGreaterThan(0);
  });

  it('re-runs the search when a filter changes', async () => {
    render(<AdministratorPropertyHistoryPage />);
    await pick('epping', /^Epping 2121/);
    await screen.findByRole('group', { name: /14 Cliff Rd, Epping/ });

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Auction'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });

    await waitFor(() =>
      expect(searchPropertyHistory).toHaveBeenLastCalledWith(expect.anything(), {
        customerId: 'c1',
        auction: true,
        dateFrom: '2026-01-01',
      })
    );
  });

  it('applies the Agent filter once typing pauses', async () => {
    jest.useFakeTimers();
    render(<AdministratorPropertyHistoryPage />);
    await act(async () => {
      await pick('epping', /^Epping 2121/);
    });

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'Betty' } });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(searchPropertyHistory).toHaveBeenLastCalledWith(expect.anything(), { agent: 'Betty' });
  });

  it("jumps from a row to another Property on the same Route", async () => {
    render(<AdministratorPropertyHistoryPage />);
    await pick('epping', /^Epping 2121/);
    const property14 = await screen.findByRole('group', { name: /14 Cliff Rd, Epping/ });

    fireEvent.click(within(property14).getAllByRole('button', { name: 'Other Properties on W26-08-101' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '3 Pennant St, Epping' }));

    expect(listRouteProperties).toHaveBeenCalledWith('r1');
    await waitFor(() =>
      expect(searchPropertyHistory).toHaveBeenLastCalledWith({ level: 'address', propertyKey: 'epping|2121|pennant street|3' }, {})
    );
    expect(screen.getByRole('combobox', { name: 'Suburb, street or address' })).toHaveValue('3 Pennant St, Epping');
  });

  it('says so when a search finds no Visits', async () => {
    (searchPropertyHistory as jest.Mock).mockResolvedValue({ level: 'address', property: null });
    render(<AdministratorPropertyHistoryPage />);
    await pick('14 cliff', /14 Cliff Rd/);

    expect(await screen.findByText(/No Visits match/)).toBeInTheDocument();
  });

  it('shows why a search failed', async () => {
    (searchPropertyHistory as jest.Mock).mockRejectedValue(new Error('Property History search failed'));
    render(<AdministratorPropertyHistoryPage />);
    await pick('14 cliff', /14 Cliff Rd/);

    expect(await screen.findByRole('alert')).toHaveTextContent('Property History search failed');
  });

  describe('reports', () => {
    const REPORT = {
      id: 'rep1',
      referenceNumber: 'PHR-20260927-ABC123',
      audience: 'customer' as const,
      customerId: 'c1',
      customerName: 'Harcourts Epping',
      generatedByName: 'Olivia Owner',
      generatedAt: '2026-09-27T03:04:05.000Z',
      searchLabel: 'Suburb: Epping 2121',
      filterLabels: ['No filters'],
      propertyCount: 2,
      visitCount: 3,
      state: 'active' as const,
      activeUntil: '2026-10-27T03:04:05.000Z',
      purgeAfter: '2026-11-26T03:04:05.000Z',
    };
    let tab: { location: { href: string }; opener: unknown; close: jest.Mock };

    beforeEach(() => {
      tab = { location: { href: '' }, opener: window, close: jest.fn() };
      jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('exports the search as shown and opens the PDF in a new tab', async () => {
      (generatePropertyHistoryReport as jest.Mock).mockResolvedValue({ report: REPORT, url: 'https://signed.example/report.pdf' });
      render(<AdministratorPropertyHistoryPage />);
      await pick('epping', /^Epping 2121/);
      await screen.findByRole('group', { name: 'Cliff Road' });

      fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

      await waitFor(() => expect(tab.location.href).toBe('https://signed.example/report.pdf'));
      expect(generatePropertyHistoryReport).toHaveBeenCalledWith({ level: 'suburb', suburb: 'epping', postcode: '2121' }, {});
      expect(tab.opener).toBeNull();
    });

    it("closes the tab and says so when the report can't be generated", async () => {
      (generatePropertyHistoryReport as jest.Mock).mockRejectedValue(new Error('Could not generate the report'));
      render(<AdministratorPropertyHistoryPage />);
      await pick('epping', /^Epping 2121/);
      await screen.findByRole('group', { name: 'Cliff Road' });

      fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not generate the report');
      expect(tab.close).toHaveBeenCalled();
    });

    it('lists every report with its Customer and who it is shared with, and opens one', async () => {
      (listPropertyHistoryReports as jest.Mock).mockResolvedValue([REPORT, { ...REPORT, id: 'rep2', referenceNumber: 'PHR-20260926-XYZ789', audience: 'administrator', customerId: null, customerName: null }]);
      (openPropertyHistoryReport as jest.Mock).mockResolvedValue('https://signed.example/rep1.pdf');
      render(<AdministratorPropertyHistoryPage />);

      fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
      const rows = within(await screen.findByRole('table')).getAllByRole('row');

      expect(rows[1]).toHaveTextContent('PHR-20260927-ABC123');
      expect(rows[1]).toHaveTextContent('Harcourts Epping');
      expect(rows[1]).toHaveTextContent('Account Owners');
      expect(rows[2]).toHaveTextContent('All customers');
      expect(rows[2]).toHaveTextContent('Administrators');

      fireEvent.click(screen.getByRole('button', { name: 'Open PHR-20260927-ABC123' }));
      await waitFor(() => expect(tab.location.href).toBe('https://signed.example/rep1.pdf'));
      expect(openPropertyHistoryReport).toHaveBeenCalledWith('rep1');
    });

    it('shows each report\'s state, restores a deleted one, and offers no Open for a purged one', async () => {
      const deleted = { ...REPORT, id: 'rep2', referenceNumber: 'PHR-20260920-DEL222', state: 'deleted' as const };
      const purged = { ...REPORT, id: 'rep3', referenceNumber: 'PHR-20260801-PUR333', state: 'purged' as const };
      (listPropertyHistoryReports as jest.Mock).mockResolvedValue([REPORT, deleted, purged]);
      (restorePropertyHistoryReport as jest.Mock).mockResolvedValue({ ...deleted, state: 'active' });
      render(<AdministratorPropertyHistoryPage />);

      fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
      const rows = within(await screen.findByRole('table')).getAllByRole('row');

      expect(rows[1]).toHaveTextContent('Active');
      expect(rows[2]).toHaveTextContent('Deleted');
      expect(rows[3]).toHaveTextContent('Purged');
      expect(screen.queryByRole('button', { name: 'Open PHR-20260801-PUR333' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Restore/ })).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Restore PHR-20260920-DEL222' }));

      await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')[2]).toHaveTextContent('Active'));
      expect(restorePropertyHistoryReport).toHaveBeenCalledWith('rep2');
      expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    });

    it('keeps the search when switching back from Reports', async () => {
      (listPropertyHistoryReports as jest.Mock).mockResolvedValue([]);
      render(<AdministratorPropertyHistoryPage />);
      await pick('epping', /^Epping 2121/);
      await screen.findByRole('group', { name: 'Cliff Road' });

      fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
      expect(await screen.findByText(/No reports yet/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Search' }));

      expect(screen.getByRole('group', { name: 'Cliff Road' })).toBeVisible();
      expect(searchPropertyHistory).toHaveBeenCalledTimes(1);
    });
  });
});
