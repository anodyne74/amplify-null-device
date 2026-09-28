import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorRouteRequestsPage from '../page';
import { dismissRouteRequest, listRouteRequests, openRouteRequestFile, type RouteRequestRow } from '@/lib/routeRequests';

jest.mock('@/lib/routeRequests', () => ({
  listRouteRequests: jest.fn(),
  dismissRouteRequest: jest.fn(),
  openRouteRequestFile: jest.fn(),
}));

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
    ...extra,
  };
}

const ANN = row({});
const SPOOFED = row({ id: 'r2', subject: 'Urgent route', fromName: null, fromAddress: 'x@evil.test' }, { senderNotVerified: true, suggestedCustomerName: null });
const STAFF = row({ id: 'r3', subject: 'Phoned in', loggedByStaff: true, attachments: [] });
const OLD = row({ id: 'r4', subject: 'Old one', status: 'dismissed', dismissedReason: 'Duplicate' });

describe('AdministratorRouteRequestsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRouteRequests as jest.Mock).mockResolvedValue({ data: [ANN, SPOOFED, STAFF, OLD] });
  });

  it('lists Unlinked emails with their flags and suggested Customer, hiding dismissed ones', async () => {
    render(<AdministratorRouteRequestsPage />);

    expect(await screen.findByText('3 emails')).toBeInTheDocument();
    expect(screen.getAllByText('Urgent route').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sender not verified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Logged by staff').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Suggested: Harcourts Epping').length).toBeGreaterThan(0);
    expect(screen.queryByText('Old one')).not.toBeInTheDocument();
  });

  it('shows dismissed emails, with their reason, when asked', async () => {
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 emails');

    fireEvent.click(screen.getByLabelText('Show dismissed'));
    fireEvent.click(screen.getByRole('button', { name: /Old one/ }));

    expect(screen.getByText('4 emails')).toBeInTheDocument();
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
    await screen.findByText('3 emails');

    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for dismissing'), { target: { value: 'Not a route request' } });
    fireEvent.click(dismiss);

    await waitFor(() => expect(screen.getByText('2 emails')).toBeInTheDocument());
    expect(dismissRouteRequest).toHaveBeenCalledWith('r1', 'Not a route request');
  });

  it('says why when dismissing fails', async () => {
    (dismissRouteRequest as jest.Mock).mockResolvedValue({ ok: false, error: 'Could not dismiss the Route Request.' });
    render(<AdministratorRouteRequestsPage />);
    await screen.findByText('3 emails');

    fireEvent.change(screen.getByLabelText('Reason for dismissing'), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Could not dismiss the Route Request.')).toBeInTheDocument();
    expect(screen.getByText('3 emails')).toBeInTheDocument();
  });

  it('says when the inbox could not be loaded', async () => {
    (listRouteRequests as jest.Mock).mockResolvedValue({ data: [], error: 'Could not load Route Requests.' });
    render(<AdministratorRouteRequestsPage />);

    expect(await screen.findByText('Could not load Route Requests.')).toBeInTheDocument();
  });
});
