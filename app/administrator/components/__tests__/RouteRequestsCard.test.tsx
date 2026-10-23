import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouteRequestsCard } from '../RouteRequestsCard';
import { acceptAmendmentAdd, rejectAmendmentLine } from '@/lib/amendmentLines';
import {
  linkRouteRequest,
  listRouteRequests,
  listRouteRequestsForRoute,
  recordManualRequest,
  unlinkRouteRequest,
} from '@/lib/routeRequests';

jest.mock('@/lib/amendmentLines', () => ({
  ...jest.requireActual('@/lib/amendmentLines'),
  acceptAmendmentAdd: jest.fn(),
  rejectAmendmentLine: jest.fn(),
}));

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

  it('shows what was read from a Route Amendment, and a way to read it again', async () => {
    const read = { ...AMENDMENT, scheduleReading: { readAt: '2026-09-28T01:05:00.000Z', readBySub: 's', attachmentIndex: -1, rows: [{ address: '3/13 Carlingford Road', change: 'add' }] } };
    (listRouteRequestsForRoute as jest.Mock).mockResolvedValue({ data: [REQUEST, read] });
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);

    expect(await screen.findByText('3/13 Carlingford Road')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read again' })).toBeInTheDocument();
  });

  it('offers to read a Route Amendment that has not been read', async () => {
    render(<RouteRequestsCard routeId="route-1" customerId="c1" />);
    expect(await screen.findByRole('button', { name: 'Read Amendment' })).toBeInTheDocument();
  });

  describe('deciding a Route Amendment\'s adds', () => {
    const reading = { readAt: '2026-09-28T01:05:00.000Z', readBySub: 's', attachmentIndex: -1, rows: [{ address: '3/13 Carlingford Road', change: 'add' }] };
    const stops = [{ address: '7 Carlingford Road, Epping NSW 2121', sequence: 1 }];
    const show = (decisions: object[] = [], route: object = { loadStartedAt: null, status: 'scheduled' }) => {
      (listRouteRequestsForRoute as jest.Mock).mockResolvedValue({ data: [REQUEST, { ...AMENDMENT, scheduleReading: reading, amendmentDecisions: decisions }] });
      const changed = jest.fn();
      render(<RouteRequestsCard routeId="route-1" customerId="c1" stops={stops} route={route} onStopsChanged={changed} />);
      return changed;
    };

    it('accepts an add, which reloads the Route\'s Stops', async () => {
      (acceptAmendmentAdd as jest.Mock).mockResolvedValue({ ok: true });
      const changed = show();

      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(changed).toHaveBeenCalled());
      expect(acceptAmendmentAdd).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: 'amd', address: '3/13 Carlingford Road, Epping 2121', stops: expect.any(Array) })
      );
    });

    it('rejects an add and shows it rejected, still acceptable', async () => {
      (rejectAmendmentLine as jest.Mock).mockResolvedValue({ ok: true });
      const changed = show();
      fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
      await waitFor(() => expect(rejectAmendmentLine).toHaveBeenCalledWith(expect.objectContaining({ change: 'add', address: '3/13 Carlingford Road' })));
      expect(changed).not.toHaveBeenCalled();
    });

    it('shows a rejected add with Accept still available, and an accepted one as accepted', async () => {
      show([{ change: 'add', address: '3/13 Carlingford Road', decision: 'rejected', decidedAt: 't', decidedBySub: 's' }]);
      expect(await screen.findByText('Rejected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    });

    it('disables Accept once Load has started, with the Load Change message, but still allows Reject', async () => {
      show([], { loadStartedAt: '2026-10-24T01:00:00Z', status: 'in_progress' });
      expect(await screen.findByRole('button', { name: 'Accept' })).toBeDisabled();
      expect(screen.getByText(/has to be made as a Load Change/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
    });

    it('shows why an accept failed', async () => {
      (acceptAmendmentAdd as jest.Mock).mockResolvedValue({ ok: false, error: 'No suburb found' });
      show();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
      expect(await screen.findByText('No suburb found')).toBeInTheDocument();
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
