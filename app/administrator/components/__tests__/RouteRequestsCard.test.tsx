import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouteRequestsCard } from '../RouteRequestsCard';
import {
  linkRouteRequest,
  listRouteRequests,
  listRouteRequestsForRoute,
  recordManualRequest,
  unlinkRouteRequest,
} from '@/lib/routeRequests';

jest.mock('@/lib/routeRequests', () => {
  const actual = jest.requireActual('@/lib/routeRequests');
  return {
    isManual: actual.isManual,
    isSenderNotVerified: actual.isSenderNotVerified,
    requesterLabel: actual.requesterLabel,
    listRouteRequests: jest.fn(),
    listRouteRequestsForRoute: jest.fn(),
    linkRouteRequest: jest.fn(),
    unlinkRouteRequest: jest.fn(),
    recordManualRequest: jest.fn(),
    openRouteRequestFile: jest.fn(),
  };
});

const record = (overrides: object) => ({
  id: 'x',
  source: 'email',
  status: 'linked',
  routeId: 'route-1',
  fromName: 'Ann Agent',
  fromAddress: 'ann@agency.test',
  sentAt: '2026-09-27T23:15:00.000Z',
  receivedAt: '2026-09-27T23:16:00.000Z',
  subject: 'Route for Tuesday',
  attachments: [],
  loggedByStaff: false,
  ...overrides,
});

const REQUEST = record({ id: 'req', role: 'request' });
const AMENDMENT = record({ id: 'amd', role: 'amendment', subject: 'Add 5 High St', sentAt: '2026-09-28T01:00:00.000Z' });
const IN_INBOX = record({ id: 'inbox-1', status: 'unlinked', routeId: null, subject: 'One more please' });

describe('RouteRequestsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRouteRequestsForRoute as jest.Mock).mockResolvedValue({ data: [REQUEST, AMENDMENT] });
    (listRouteRequests as jest.Mock).mockResolvedValue({
      data: [{ request: IN_INBOX }, { request: REQUEST }].map((row) => ({ ...row, suggestedCustomerName: null, senderNotVerified: false, routeCode: null })),
    });
  });

  it('lists the Route Request and Amendments in the order sent', async () => {
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);

    const summaries = await screen.findAllByText(/^Route (Request|Amendment)$/);
    expect(summaries.map((node) => node.textContent)).toEqual(['Route Request', 'Route Amendment']);
    expect(listRouteRequestsForRoute).toHaveBeenCalledWith('route-1');
  });

  it('says when there is no Route Request yet', async () => {
    (listRouteRequestsForRoute as jest.Mock).mockResolvedValue({ data: [] });
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);

    expect(await screen.findByText('No Route Request yet.')).toBeInTheDocument();
  });

  it('links an inbox email, offering only Amendments once the Route has its Route Request', async () => {
    (linkRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);
    await screen.findAllByText('Route Request');

    fireEvent.click(screen.getByRole('button', { name: 'Link from the inbox' }));
    const select = screen.getByLabelText('Email from the inbox');
    expect(select.querySelectorAll('option')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'inbox-1' } });
    expect(screen.getByRole('radio', { name: 'Route Request' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Link as Route Amendment' }));

    await waitFor(() =>
      expect(linkRouteRequest).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'inbox-1', routeId: 'route-1', role: 'amendment' }))
    );
    await waitFor(() => expect(listRouteRequestsForRoute).toHaveBeenCalledTimes(2));
  });

  it('records a Route Request by hand when the Route has none', async () => {
    (listRouteRequestsForRoute as jest.Mock).mockResolvedValue({ data: [] });
    (recordManualRequest as jest.Mock).mockResolvedValue({ ok: true });
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);
    await screen.findByText('No Route Request yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Record by hand' }));
    fireEvent.change(screen.getByLabelText('Requested by'), { target: { value: 'Ben on the phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Route Request' }));

    await waitFor(() =>
      expect(recordManualRequest).toHaveBeenCalledWith(
        expect.objectContaining({ routeId: 'route-1', role: 'request', requesterName: 'Ben on the phone', customerId: 'c1' })
      )
    );
  });

  it('unlinks a record, and says why when it cannot', async () => {
    (unlinkRouteRequest as jest.Mock).mockResolvedValue({ ok: false, error: 'Could not unlink it.' });
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);
    await screen.findAllByText('Route Request');

    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[1]);

    expect(await screen.findByText('Could not unlink it.')).toBeInTheDocument();
    expect(unlinkRouteRequest).toHaveBeenCalledWith('amd');
  });
});
