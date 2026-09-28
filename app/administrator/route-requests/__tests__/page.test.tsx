import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorRouteRequestsPage from '../page';
import {
  dismissRouteRequest,
  linkRouteRequest,
  listLinkableRoutes,
  listRouteRequests,
  openRouteRequestFile,
  unlinkRouteRequest,
  type RouteRequestRow,
} from '@/lib/routeRequests';

jest.mock('@/lib/routeRequests', () => {
  const actual = jest.requireActual('@/lib/routeRequests');
  return {
    isManual: actual.isManual,
    requesterLabel: actual.requesterLabel,
    isSenderNotVerified: actual.isSenderNotVerified,
    listRouteRequests: jest.fn(),
    listLinkableRoutes: jest.fn(),
    linkRouteRequest: jest.fn(),
    unlinkRouteRequest: jest.fn(),
    dismissRouteRequest: jest.fn(),
    openRouteRequestFile: jest.fn(),
  };
});

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function row(overrides: Partial<RouteRequestRow['request']>, extra: Partial<RouteRequestRow> = {}): RouteRequestRow {
  return {
    request: {
      id: 'r1',
      fromName: 'Ann Agent',
      fromAddress: 'ann.agent@harcourts.com.au',
      sentAt: '2026-09-27T23:15:00.000Z',
      receivedAt: '2026-09-27T23:16:02.000Z',
      subject: 'Route for Tuesday 6 Oct',
      bodyText: 'Please schedule the attached properties.',
      rawMessageKey: 'r1',
      attachments: [{ key: 'requests/r1/0-schedule.pdf', filename: 'schedule.pdf', contentType: 'application/pdf', size: 2048, inline: false }],
      loggedByStaff: false,
      status: 'unlinked',
      createdAt: '',
      updatedAt: '',
      ...overrides,
    } as RouteRequestRow['request'],
    suggestedCustomerName: 'Harcourts Epping',
    senderNotVerified: false,
    routeCode: null,
    ...extra,
  };
}

const ANN = row({});
const SPOOFED = row({ id: 'r2', subject: 'Urgent route', fromName: null, fromAddress: 'x@evil.test', spfVerdict: 'FAIL' }, { senderNotVerified: true, suggestedCustomerName: null });
const STAFF = row({ id: 'r3', subject: 'Phoned in', loggedByStaff: true, attachments: [] });
const OLD = row({ id: 'r4', subject: 'Old one', status: 'dismissed', dismissedReason: 'Duplicate' });
const LINKED = row({ id: 'r5', subject: 'Already done', status: 'linked', routeId: 'route-1', role: 'request' }, { routeCode: 'EPP-1' });

const ROUTES = [
  { id: 'route-1', label: 'EPP-1 (2026-10-06)', customerId: 'c1', hasRouteRequest: true },
  { id: 'route-2', label: 'EPP-2 (2026-10-07)', customerId: 'c1', hasRouteRequest: false },
];

describe('AdministratorRouteRequestsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRouteRequests as jest.Mock).mockResolvedValue({ data: [ANN, SPOOFED, STAFF, OLD, LINKED] });
    (listLinkableRoutes as jest.Mock).mockResolvedValue({ data: ROUTES });
  });

  it('lists Unlinked records with their flags and suggested Customer, hiding linked and dismissed ones', async () => {
    render(<AdministratorRouteRequestsPage />);

    expect(await screen.findByText('3 items')).toBeInTheDocument();
    expect(screen.getAllByText('Urgent route').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sender not verified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Logged by staff').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Suggested: Harcourts Epping').length).toBeGreaterThan(0);
    expect(screen.queryByText('Old one')).not.toBeInTheDocument();
    expect(screen.queryByText('Already done')).not.toBeInTheDocument();
  });

  it('shows dismissed emails, with their reason, when asked', async () => {
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    fireEvent.click(screen.getByLabelText('Show dismissed'));
    fireEvent.click(screen.getByRole('button', { name: /Old one/ }));

    expect(screen.getByText('4 items')).toBeInTheDocument();
    expect(screen.getByText(/^Dismissed.*: Duplicate$/)).toBeInTheDocument();
  });

  it('shows the body and downloads an attachment and the original email', async () => {
    (openRouteRequestFile as jest.Mock).mockResolvedValue('https://signed.example/file');
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AdministratorRouteRequestsPage />);

    expect(await screen.findByText('Please schedule the attached properties.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'schedule.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download original email' }));

    await waitFor(() => expect(openRouteRequestFile).toHaveBeenCalledTimes(2));
    expect(openRouteRequestFile).toHaveBeenNthCalledWith(1, 'r1', 0);
    expect(openRouteRequestFile).toHaveBeenNthCalledWith(2, 'r1', 'raw');
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('needs a reason to dismiss, then hides the email', async () => {
    (dismissRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for dismissing'), { target: { value: 'Not a route request' } });
    fireEvent.click(dismiss);

    await waitFor(() => expect(screen.getByText('2 items')).toBeInTheDocument());
    expect(dismissRouteRequest).toHaveBeenCalledWith('r1', 'Not a route request');
  });

  it('says why when dismissing fails', async () => {
    (dismissRouteRequest as jest.Mock).mockResolvedValue({ ok: false, error: 'Could not dismiss the Route Request.' });
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    fireEvent.change(screen.getByLabelText('Reason for dismissing'), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Could not dismiss the Route Request.')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('links a record to a Route, offering only an Amendment for a Route that has its Route Request', async () => {
    (linkRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    fireEvent.change(screen.getByLabelText('Route'), { target: { value: 'route-1' } });
    expect(screen.getByLabelText('Route Request')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Route'), { target: { value: 'route-2' } });
    fireEvent.click(screen.getByLabelText('Route Request'));
    fireEvent.click(screen.getByRole('button', { name: 'Link as Route Request' }));

    await waitFor(() => expect(linkRouteRequest).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'r1', routeId: 'route-2', role: 'request' })));
    expect(listRouteRequests).toHaveBeenCalledTimes(2);
  });

  it('offers to create a Route from a record', async () => {
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    expect(screen.getByRole('link', { name: 'Create Route from it' })).toHaveAttribute('href', '/administrator/routes/new?request=r1');
  });

  it('shows linked records with their Route, and unlinks one', async () => {
    (unlinkRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 items');

    fireEvent.click(screen.getByLabelText('Show linked'));
    fireEvent.click(screen.getByRole('button', { name: /Already done/ }));

    expect(screen.getByRole('link', { name: 'Route EPP-1' })).toHaveAttribute('href', '/administrator/routes/detail?id=route-1');
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(unlinkRouteRequest).toHaveBeenCalledWith('r5'));
  });

  it('says when the inbox could not be loaded', async () => {
    (listRouteRequests as jest.Mock).mockResolvedValue({ data: [], error: 'Could not load Route Requests.' });
    render(<AdministratorRouteRequestsPage />);

    expect(await screen.findByText('Could not load Route Requests.')).toBeInTheDocument();
  });
});
