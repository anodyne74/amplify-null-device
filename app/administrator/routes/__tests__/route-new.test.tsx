import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewRoutePage from '../new/page';
import { createRoute, createStopsForRoute, getRouteWithStops, listAllRoutes } from '@/lib/routes';
import { listAllCustomers } from '@/lib/customers';
import { attachNewRouteRequest, fetchRouteRequestAttachment, getRouteRequest } from '@/lib/routeRequests';
import { extractScheduleText } from '@/lib/extractScheduleText';

const mockRouterPush = jest.fn();
let mockRequestParam: string | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'request' ? mockRequestParam : null) }),
}));

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/app/operator/components/RouteForm', () => ({
  RouteForm: () => <div>Route form</div>,
}));

jest.mock('@/lib/routes');
jest.mock('@/lib/customers');
jest.mock('@/lib/extractScheduleText', () => ({ extractScheduleText: jest.fn() }));
jest.mock('@/lib/routeScheduleGuard', () => ({ checkRouteDateBlocked: jest.fn().mockResolvedValue({ blocked: false }) }));
jest.mock('@/lib/routeRequests', () => {
  const actual = jest.requireActual('@/lib/routeRequests');
  return {
    isManual: actual.isManual,
    isSenderNotVerified: actual.isSenderNotVerified,
    requesterLabel: actual.requesterLabel,
    scheduleAttachmentIndex: actual.scheduleAttachmentIndex,
    getRouteRequest: jest.fn(),
    fetchRouteRequestAttachment: jest.fn(),
    attachNewRouteRequest: jest.fn(),
    openRouteRequestFile: jest.fn(),
  };
});

const EMAIL = {
  id: 'e1',
  source: 'email',
  status: 'unlinked',
  fromName: 'Ann Agent',
  fromAddress: 'ann@agency.test',
  sentAt: '2026-09-27T23:15:00.000Z',
  receivedAt: '2026-09-27T23:16:00.000Z',
  subject: 'Route for Tuesday',
  bodyText: 'Please schedule these.',
  suggestedCustomerId: 'c2',
  loggedByStaff: false,
  attachments: [
    { key: 'requests/e1/0-logo.png', filename: 'logo.png', contentType: 'image/png', inline: true },
    { key: 'requests/e1/1-schedule.pdf', filename: 'schedule.pdf', contentType: 'application/pdf', inline: false },
  ],
};

async function createFromCopiedStops() {
  fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create Route (1 stops)' }));
}

describe('NewRoutePage Route Request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestParam = null;
    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'First Agency', email: 'a@first.test' },
      { id: 'c2', name: 'Harcourts Epping', email: 'a@epping.test' },
    ]);
    (listAllRoutes as jest.Mock).mockResolvedValue([
      { id: 'old-route', customerId: 'c1', routeCode: 'OLD-1' },
      { id: 'old-route', customerId: 'c2', routeCode: 'OLD-1' },
    ]);
    (getRouteWithStops as jest.Mock).mockResolvedValue({ stops: [{ address: '1 Main St' }] });
    (createRoute as jest.Mock).mockResolvedValue({ id: 'new-route' });
    (createStopsForRoute as jest.Mock).mockResolvedValue([{ success: true, index: 0 }]);
    (attachNewRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
    (extractScheduleText as jest.Mock).mockResolvedValue('1 Main St');
  });

  it('prefills the Customer and Schedule from an inbox email, and links it as the new Route’s Route Request', async () => {
    mockRequestParam = 'e1';
    (getRouteRequest as jest.Mock).mockResolvedValue(EMAIL);
    const schedule = new File(['pdf'], 'schedule.pdf', { type: 'application/pdf' });
    (fetchRouteRequestAttachment as jest.Mock).mockResolvedValue(schedule);
    render(<NewRoutePage />);

    await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));
    expect(fetchRouteRequestAttachment).toHaveBeenCalledWith('e1', 1, 'schedule.pdf', 'application/pdf');
    // The email's own download button, and the import panel's file, now loaded.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'schedule.pdf' })).toHaveLength(2));
    expect(screen.getByLabelText('Schedule from the email')).toHaveValue('1');

    await createFromCopiedStops();

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/administrator/routes/detail?id=new-route'));
    expect(createRoute).toHaveBeenCalledWith(expect.not.objectContaining({ scheduleS3Key: expect.anything() }));
    expect(attachNewRouteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 'new-route', customerId: 'c2', fromRecordId: 'e1', file: null })
    );
  });

  it('needs the requester’s name for an email Logged by staff', async () => {
    mockRequestParam = 'e1';
    (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, loggedByStaff: true, attachments: [] });
    render(<NewRoutePage />);
    await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));

    await createFromCopiedStops();
    expect(await screen.findByText(/Enter the name of the person who asked for this Route/)).toBeInTheDocument();
    expect(createRoute).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Requested by'), { target: { value: 'Ann Agent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Route (1 stops)' }));
    await waitFor(() =>
      expect(attachNewRouteRequest).toHaveBeenCalledWith(expect.objectContaining({ fromRecordId: 'e1', requester: { name: 'Ann Agent', email: '' } }))
    );
  });

  it('keeps an uploaded Schedule as a manual Route Request instead of writing scheduleS3Key', async () => {
    render(<NewRoutePage />);
    const file = new File(['pdf'], 'mine.pdf', { type: 'application/pdf' });
    const input = (await screen.findByText('Choose File')).closest('div')!.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    await createFromCopiedStops();

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalled());
    expect(createRoute).toHaveBeenCalledWith(expect.not.objectContaining({ scheduleS3Key: expect.anything() }));
    expect(attachNewRouteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 'new-route', customerId: 'c1', fromRecordId: null, requester: null, file })
    );
  });

  it('creates the Stops before the Route Request, so a failed link never leaves an empty Route', async () => {
    (attachNewRouteRequest as jest.Mock).mockResolvedValue({ ok: false, error: 'That Route already has a Route Request.' });
    render(<NewRoutePage />);
    fireEvent.change(await screen.findByLabelText('Requested by (optional)'), { target: { value: 'Ben' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Phoned in' } });

    await createFromCopiedStops();

    expect(await screen.findByText(/not linked to its Route Request: That Route already has a Route Request\./)).toBeInTheDocument();
    expect(createStopsForRoute).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(attachNewRouteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requester: { name: 'Ben', email: '' }, note: 'Phoned in' })
    );
  });

  it('says so when the email is no longer in the inbox', async () => {
    mockRequestParam = 'e1';
    (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, status: 'linked' });
    render(<NewRoutePage />);

    expect(await screen.findByText(/no longer in the Request inbox/)).toBeInTheDocument();
  });
});
