import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouteRequestsSection } from '../RouteRequestsSection';
import { downloadCustomerRouteRequestFile, listCustomerRouteRequests } from '@/lib/customerRouteRequests';

jest.mock('@/lib/customerRouteRequests', () => ({
  listCustomerRouteRequests: jest.fn(),
  downloadCustomerRouteRequestFile: jest.fn(),
}));

const entry = (overrides: object) => ({
  id: 'x',
  role: 'amendment',
  requesterName: 'Ann Agent',
  requesterEmail: 'ann@agency.test',
  recordedByNullDevice: false,
  sentAt: '2026-09-27T23:15:00.000Z',
  subject: 'Route for Tuesday',
  bodyText: 'Please see attached.',
  attachments: [],
  ...overrides,
});

describe('RouteRequestsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the Route Request, then each Amendment, with who sent it, when, and what it said', async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      entry({ id: 'req', role: 'request' }),
      entry({ id: 'amd', subject: 'Add 5 High St', bodyText: 'One more.' }),
    ]);
    render(<RouteRequestsSection routeId="route-1" />);

    const headings = await screen.findAllByText(/^Route (Request|Amendment)$/);
    expect(headings.map((node) => node.textContent)).toEqual(['Route Request', 'Route Amendment']);
    expect(screen.getAllByText(/From Ann Agent <ann@agency.test>/)).toHaveLength(2);
    expect(screen.getByText('Add 5 High St')).toBeInTheDocument();
    expect(screen.getByText('One more.')).toBeInTheDocument();
    expect(listCustomerRouteRequests).toHaveBeenCalledWith('route-1');
  });

  it('shows a manual entry with the name entered and "Recorded by Null Device" in place of an email', async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      entry({ role: 'request', requesterName: 'Cat Caller', requesterEmail: null, recordedByNullDevice: true, subject: null, bodyText: null }),
    ]);
    render(<RouteRequestsSection routeId="route-1" />);

    expect(await screen.findByText(/Requested by Cat Caller/)).toHaveTextContent('Recorded by Null Device');
  });

  it('names nobody when nothing was entered for one recorded by hand', async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      entry({ role: 'request', requesterName: null, requesterEmail: null, recordedByNullDevice: true }),
    ]);
    render(<RouteRequestsSection routeId="route-1" />);

    const meta = await screen.findByText(/Recorded by Null Device/);
    expect(meta.textContent).not.toMatch(/Requested by|From/);
  });

  it('says "No request on file" when the Route has no Route Request', async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([]);
    render(<RouteRequestsSection routeId="route-1" />);

    expect(await screen.findByText('No request on file')).toBeInTheDocument();
  });

  it('still says "No request on file" above Amendments when the Route has no Route Request', async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([entry({ id: 'amd' })]);
    render(<RouteRequestsSection routeId="route-1" />);

    expect(await screen.findByText('No request on file')).toBeInTheDocument();
    expect(screen.getByText('Route Amendment')).toBeInTheDocument();
  });

  it('says so when the requests cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (listCustomerRouteRequests as jest.Mock).mockRejectedValue(new Error('403'));
    render(<RouteRequestsSection routeId="route-1" />);

    expect(await screen.findByText('Could not load the requests for this route.')).toBeInTheDocument();
  });

  it('collapses a long body until asked to show more', async () => {
    const bodyText = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6'].join('\n');
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([entry({ bodyText })]);
    render(<RouteRequestsSection routeId="route-1" />);

    const toggle = await screen.findByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it("downloads an attachment by its position in the record", async () => {
    (listCustomerRouteRequests as jest.Mock).mockResolvedValue([
      entry({ id: 'req', attachments: [{ index: 2, filename: 'run.pdf', contentType: 'application/pdf', size: 1000 }] }),
    ]);
    (downloadCustomerRouteRequestFile as jest.Mock).mockResolvedValue('https://signed.example/run.pdf');
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<RouteRequestsSection routeId="route-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'run.pdf' }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(downloadCustomerRouteRequestFile).toHaveBeenCalledWith('req', 2);
    click.mockRestore();
  });
});
