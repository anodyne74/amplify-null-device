import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewRoutePage from '../new/page';
import { createRoute, createStopsForRoute, getRouteWithStops, listAllRoutes } from '@/lib/routes';
import { listAllCustomers } from '@/lib/customers';
import { attachNewRouteRequest, getRouteRequest } from '@/lib/routeRequests';
import { locateDraftStops } from '@/lib/stopLocation';

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
  ...jest.requireActual('@/app/operator/components/RouteForm'),
  RouteForm: () => <div>Route form</div>,
}));

jest.mock('@/lib/routes');
jest.mock('@/lib/customers');
jest.mock('@/lib/stopLocation', () => ({
  ...jest.requireActual('@/lib/stopLocation'),
  // Pins every draft as-is: these tests are about the draft list, not the map.
  locateDraftStops: jest.fn(async (drafts: unknown[]) => ({ stops: drafts, unpinned: 0, leftOut: [] })),
}));
jest.mock('@/lib/routeScheduleGuard', () => ({ checkRouteDateBlocked: jest.fn().mockResolvedValue({ blocked: false }) }));
jest.mock('@/lib/routeRequests', () => {
  const actual = jest.requireActual('@/lib/routeRequests');
  return {
    isManual: actual.isManual,
    isSenderNotVerified: actual.isSenderNotVerified,
    requesterLabel: actual.requesterLabel,
    scheduleAttachmentIndex: actual.scheduleAttachmentIndex,
    getRouteRequest: jest.fn(),
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
  });

  it('prefills the Customer and Schedule from an inbox email, and links it as the new Route’s Route Request', async () => {
    mockRequestParam = 'e1';
    (getRouteRequest as jest.Mock).mockResolvedValue(EMAIL);
    render(<NewRoutePage />);

    await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));
    // The email keeps its own files, so there is nothing to upload.
    expect(screen.queryByText('Choose File')).not.toBeInTheDocument();

    await createFromCopiedStops();

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/administrator/routes/detail?id=new-route'));
    expect(createRoute).toHaveBeenCalledWith(expect.not.objectContaining({ scheduleS3Key: expect.anything() }));
    expect(attachNewRouteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 'new-route', customerId: 'c2', fromRecordId: 'e1', file: null })
    );
  });

  it('pre-selects the Customer’s latest Route to copy when creating from a Route Request', async () => {
    mockRequestParam = 'e1';
    (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, attachments: [] });
    (listAllRoutes as jest.Mock).mockResolvedValue([
      { id: 'older', customerId: 'c2', routeCode: 'OLD-1', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'latest', customerId: 'c2', routeCode: 'OLD-2', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'other-customer', customerId: 'c1', routeCode: 'OLD-3', createdAt: '2026-10-10T00:00:00.000Z' },
    ]);
    render(<NewRoutePage />);

    await waitFor(() => expect(screen.getByLabelText('Copy Stops From Previous Route')).toHaveValue('latest'));
  });

  it('leaves the copy source empty when not creating from a Route Request', async () => {
    (listAllRoutes as jest.Mock).mockResolvedValue([{ id: 'old-route', customerId: 'c1', routeCode: 'OLD-1' }]);
    render(<NewRoutePage />);
    await screen.findByLabelText('Copy Stops From Previous Route');
    expect(screen.getByLabelText('Copy Stops From Previous Route')).toHaveValue('');
  });

  describe('Schedule Diff', () => {
    const READING = {
      readAt: '2026-10-18T01:00:00.000Z',
      readBySub: 'sub-admin',
      attachmentIndex: 1,
      rows: [{ address: '12 Alder Street, Hillview' }, { address: '31 Hazel Road Riverbend' }],
      warnings: [],
    };
    const copiedStop = (address: string, number: string, street: string, suburb: string) => ({
      address,
      addressStreetNumber: number,
      addressStreet: street,
      addressSuburb: suburb,
    });

    beforeEach(() => {
      mockRequestParam = 'e1';
      (getRouteWithStops as jest.Mock).mockResolvedValue({
        stops: [copiedStop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview'), copiedStop('15 Grove Crescent, Hillview', '15', 'Grove Crescent', 'Hillview')],
      });
    });

    it('shows what the Schedule suggests once its Stops are copied, and applies nothing', async () => {
      (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, scheduleReading: READING });
      render(<NewRoutePage />);
      await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));

      fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
      fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));

      const panel = await screen.findByRole('region', { name: 'Schedule Diff' });
      expect(panel).toHaveTextContent('1 to add, 1 to drop, 0 to change, 0 instructions, 0 to check, 1 unchanged.');
      expect(panel).toHaveTextContent('31 Hazel Road Riverbend');
      expect(panel).toHaveTextContent('15 Grove Crescent, Hillview');
      expect(screen.getByRole('button', { name: 'Create Route (2 stops)' })).toBeInTheDocument();
    });

    async function copyWithReading() {
      (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, scheduleReading: READING });
      render(<NewRoutePage />);
      await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));
      fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
      fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));
      await screen.findByRole('region', { name: 'Schedule Diff' });
    }
    const createdStopAddresses = () => (createStopsForRoute as jest.Mock).mock.calls[0][2].map((stop: { address: string }) => stop.address);

    it('creates the copied Route unchanged when every line is rejected', async () => {
      await copyWithReading();
      fireEvent.click(screen.getByRole('button', { name: 'Reject: add 31 Hazel Road Riverbend' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reject: drop 15 Grove Crescent, Hillview' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create Route (2 stops)' }));

      await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
      expect(createdStopAddresses()).toEqual(['12 Alder Street, Hillview', '15 Grove Crescent, Hillview']);
    });

    it('puts an accepted Add at the bottom and takes an accepted Drop out, then creates the Route with them', async () => {
      await copyWithReading();
      fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));
      fireEvent.click(screen.getByRole('button', { name: 'Accept: drop 15 Grove Crescent, Hillview' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Create Route (2 stops)' }));
      await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
      expect(createdStopAddresses()).toEqual(['12 Alder Street, Hillview', '31 Hazel Road Riverbend']);
      expect(locateDraftStops).toHaveBeenCalledWith([expect.objectContaining({ address: '31 Hazel Road Riverbend' })]);
      expect(attachNewRouteRequest).toHaveBeenCalledWith(expect.objectContaining({ fromRecordId: 'e1' }));
    });

    it('takes an accepted line back when it is then rejected', async () => {
      await copyWithReading();
      fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));
      fireEvent.click(screen.getByRole('button', { name: 'Accept: drop 15 Grove Crescent, Hillview' }));
      await screen.findByRole('button', { name: 'Create Route (2 stops)' });

      fireEvent.click(screen.getByRole('button', { name: 'Reject: add 31 Hazel Road Riverbend' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reject: drop 15 Grove Crescent, Hillview' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Create Route (2 stops)' }));
      await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
      expect(createdStopAddresses()).toEqual(['12 Alder Street, Hillview', '15 Grove Crescent, Hillview']);
    });

    it('keeps a note edited on a Stop through taking it out and back', async () => {
      await copyWithReading();
      fireEvent.change(screen.getByLabelText('Notes for stop 2, 15 Grove Crescent, Hillview'), { target: { value: 'Side gate' } });
      fireEvent.click(screen.getByRole('button', { name: 'Accept: drop 15 Grove Crescent, Hillview' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reject: drop 15 Grove Crescent, Hillview' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Create Route (2 stops)' }));
      await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
      expect((createStopsForRoute as jest.Mock).mock.calls[0][2][1]).toMatchObject({ address: '15 Grove Crescent, Hillview', notes: 'Side gate' });
    });

    describe('Change lines', () => {
      const withRows = (rows: object[], stops: object[]) => {
        (getRouteWithStops as jest.Mock).mockResolvedValue({ stops });
        (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, scheduleReading: { ...READING, rows } });
      };
      const stopAt = (address: string, number: string, street: string, extra: object = {}) => ({
        address,
        addressStreetNumber: number,
        addressStreet: street,
        addressSuburb: 'Hillview',
        ...extra,
      });
      const open = async () => {
        render(<NewRoutePage />);
        await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));
        fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
        fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));
        await screen.findByRole('region', { name: 'Schedule Diff' });
      };
      const created = () => (createStopsForRoute as jest.Mock).mock.calls[0][2];

      it('proposes nothing for an agent written differently from the Route’s, and changes only the field accepted', async () => {
        withRows(
          [
            { address: '12 Alder Street, Hillview', agent: 'AJ', numberOfSigns: 3 },
            { address: '15 Grove Crescent, Hillview', agent: 'Dana', numberOfSigns: 5 },
          ],
          [
            stopAt('12 Alder Street, Hillview', '12', 'Alder Street', { agent: 'Alex', numberOfSigns: 5, notes: 'Side gate' }),
            stopAt('15 Grove Crescent, Hillview', '15', 'Grove Crescent', { agent: 'Blake', numberOfSigns: 5 }),
          ]
        );
        await open();

        // 12 Alder: AJ is Alex, so only the signs differ. 15 Grove: Dana is a new agent.
        expect(screen.queryByRole('button', { name: /Accept: change agent of 12 Alder/ })).not.toBeInTheDocument();
        expect(screen.getByText('New agent')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Accept: change signs of 12 Alder Street, Hillview' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Create Route (2 stops)' }));
        await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());

        expect(created()[0]).toMatchObject({ address: '12 Alder Street, Hillview', numberOfSigns: 3, agent: 'Alex', notes: 'Side gate' });
        expect(created()[1]).toMatchObject({ address: '15 Grove Crescent, Hillview', numberOfSigns: 5, agent: 'Blake' });
      });

      it('takes an accepted change back to what the copy had, and gives an Add the Route’s spelling of its agent', async () => {
        withRows(
          [
            { address: '12 Alder Street, Hillview', agent: 'Blake' },
            { address: '31 Hazel Road Riverbend', agent: 'AJ', isPreview: true, numberOfSigns: 1 },
          ],
          [stopAt('12 Alder Street, Hillview', '12', 'Alder Street', { agent: 'Alex' })]
        );
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Accept: change agent of 12 Alder Street, Hillview' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject: change agent of 12 Alder Street, Hillview' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Create Route (2 stops)' }));
        await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());

        expect(created()[0]).toMatchObject({ address: '12 Alder Street, Hillview', agent: 'Alex' });
        expect(created()[1]).toMatchObject({ address: '31 Hazel Road Riverbend', agent: 'Alex', numberOfSigns: 1, notes: 'Preview' });
      });

      it('adds a Preview to the note as it now stands, and the auction mark', async () => {
        withRows(
          [{ address: '12 Alder Street, Hillview', isPreview: true, isAuction: true }],
          [stopAt('12 Alder Street, Hillview', '12', 'Alder Street', { agent: 'Alex', notes: 'Side gate' })]
        );
        await open();
        fireEvent.change(screen.getByLabelText('Notes for stop 1, 12 Alder Street, Hillview'), { target: { value: 'Side gate, ring bell' } });
        fireEvent.click(screen.getByRole('button', { name: 'Accept all changes' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Create Route (1 stops)' }));
        await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());

        expect(created()[0]).toMatchObject({ notes: 'Side gate, ring bell; Preview', isAuction: true });
      });
    });

    describe('Instructions', () => {
      const withInstructions = (instructions: object[], rows: object[] = [{ address: '12 Alder Street, Hillview' }], extraCustomer: object = {}) => {
        (listAllCustomers as jest.Mock).mockResolvedValue([
          { id: 'c1', name: 'First Agency', email: 'a@first.test' },
          { id: 'c2', name: 'Harcourts Epping', email: 'a@epping.test', ...extraCustomer },
        ]);
        (getRouteWithStops as jest.Mock).mockResolvedValue({
          stops: [{ address: '12 Alder Street, Hillview', addressStreetNumber: '12', addressStreet: 'Alder Street', addressSuburb: 'Hillview', notes: 'Side gate' }],
        });
        (getRouteRequest as jest.Mock).mockResolvedValue({ ...EMAIL, scheduleReading: { ...READING, rows, instructions } });
      };
      const open = async () => {
        render(<NewRoutePage />);
        await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));
        fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
        fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));
        await screen.findByRole('region', { name: 'Schedule Diff' });
      };
      const submit = async () => {
        fireEvent.click(await screen.findByRole('button', { name: /^Create Route/ }));
        await waitFor(() => expect(createRoute).toHaveBeenCalled());
      };

      it('puts an accepted instruction about a property in that Stop’s note, after what is there', async () => {
        withInstructions([{ text: 'Ring the bell first', address: '12 Alder St Hillview', source: 'email' }]);
        await open();
        expect(screen.getByText(/Stop.s note now: .Side gate./)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Accept: instruction 1' }));
        await submit();

        expect(createStopsForRoute).toHaveBeenCalledTimes(1);
        expect((createStopsForRoute as jest.Mock).mock.calls[0][2][0].notes).toBe('Side gate; Ring the bell first');
        expect((createRoute as jest.Mock).mock.calls[0][0].customerInstructions).toBeUndefined();
      });

      it('puts an accepted route-wide instruction in the Route’s customer instructions, and shows the standing ones beside it', async () => {
        withInstructions([{ text: 'Call the office on arrival', source: 'sheet' }], [{ address: '12 Alder Street, Hillview' }], { standingInstructions: 'Use the main road' });
        await open();
        expect(screen.getByText(/Standing instructions: .Use the main road./)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Accept: instruction 1' }));
        await submit();

        const feed = JSON.parse((createRoute as jest.Mock).mock.calls[0][0].customerInstructions);
        expect(feed.entries.map((entry: { text: string }) => entry.text)).toEqual(['Call the office on arrival']);
      });

      it('changes nothing when an instruction is rejected, or accepted and then taken back', async () => {
        withInstructions([{ text: 'Ring the bell first', address: '12 Alder Street, Hillview' }, { text: 'Call the office' }]);
        await open();
        fireEvent.click(screen.getByRole('button', { name: 'Accept: instruction 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept: instruction 2' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject: instruction 1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject: instruction 2' }));
        await submit();

        expect((createStopsForRoute as jest.Mock).mock.calls[0][2][0].notes).toBe('Side gate');
        expect((createRoute as jest.Mock).mock.calls[0][0].customerInstructions).toBeUndefined();
      });

      it('has nothing to accept for an instruction the Stop’s note already says, or when there are none', async () => {
        withInstructions([{ text: 'side gate', address: '12 Alder Street, Hillview' }]);
        await open();
        expect(screen.queryByRole('heading', { name: /^Instructions/ })).not.toBeInTheDocument();
      });

      it('cannot place an instruction about an Add until the Add is accepted, then can', async () => {
        withInstructions(
          [{ text: 'Use the side street', address: '31 Hazel Road Riverbend' }],
          [{ address: '12 Alder Street, Hillview' }, { address: '31 Hazel Road Riverbend' }]
        );
        (locateDraftStops as jest.Mock).mockImplementationOnce(async (drafts: any[]) => ({
          stops: drafts.map((d) => ({ ...d, addressStreetNumber: '31', addressStreet: 'Hazel Road', addressSuburb: 'Riverbend' })),
          unpinned: 0,
          leftOut: [],
        }));
        await open();
        expect(screen.getByText(/No Stop at that address on the Route yet/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Accept: instruction 1' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Accept: instruction 1' }));
        await submit();

        expect((createStopsForRoute as jest.Mock).mock.calls[0][2][1]).toMatchObject({ address: '31 Hazel Road Riverbend', notes: 'Use the side street' });
      });
    });

    it('does not add a row that cannot be found on the map without a suburb, and says so', async () => {
      (locateDraftStops as jest.Mock).mockResolvedValueOnce({ stops: [], unpinned: 0, leftOut: ['31 Hazel Road Riverbend'] });
      await copyWithReading();
      fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));

      expect(await screen.findByText(/31 Hazel Road Riverbend has no suburb that could be found on the map/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Route (2 stops)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('points to Read Schedule when the Stops are copied but the Schedule has not been read', async () => {
      (getRouteRequest as jest.Mock).mockResolvedValue(EMAIL);
      render(<NewRoutePage />);
      await waitFor(() => expect(screen.getByLabelText('Customer')).toHaveValue('c2'));

      fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
      fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));

      expect(await screen.findByText(/Read the Schedule, under Route Request/)).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Schedule Diff' })).not.toBeInTheDocument();
    });
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

describe('NewRoutePage copied Stop notes (#464)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestParam = null;
    (listAllCustomers as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'First Agency', email: 'a@first.test' }]);
    (listAllRoutes as jest.Mock).mockResolvedValue([{ id: 'old-route', customerId: 'c1', routeCode: 'OLD-1' }]);
    (getRouteWithStops as jest.Mock).mockResolvedValue({
      stops: [
        { address: '1409/26 Cambridge St, Epping', notes: 'Late addition to list [PLACEMENT_DONE:2026-10-04T04:11:27.513Z]' },
        { address: '20 Gloucester Road, Epping', notes: 'Gate code 1234' },
        { address: '9 Grayson Rd, North Epping' },
      ],
    });
    (createRoute as jest.Mock).mockResolvedValue({ id: 'new-route' });
    (createStopsForRoute as jest.Mock).mockResolvedValue([
      { success: true, index: 0 },
      { success: true, index: 1 },
      { success: true, index: 2 },
    ]);
    (attachNewRouteRequest as jest.Mock).mockResolvedValue({ ok: true });
  });

  async function copyStops() {
    render(<NewRoutePage />);
    fireEvent.change(await screen.findByLabelText('Copy Stops From Previous Route'), { target: { value: 'old-route' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));
    await screen.findByRole('button', { name: 'Create Route (3 stops)' });
  }

  function createdStops() {
    return (createStopsForRoute as jest.Mock).mock.calls[0][2] as Array<{ address: string; notes?: string }>;
  }

  it('shows each copied note in the review table', async () => {
    await copyStops();

    expect(screen.getByLabelText('Notes for stop 1, 1409/26 Cambridge St, Epping')).toHaveValue('Late addition to list');
    expect(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping')).toHaveValue('Gate code 1234');
    expect(screen.getByLabelText('Notes for stop 3, 9 Grayson Rd, North Epping')).toHaveValue('');
  });

  it('keeps a copied note nobody touched', async () => {
    await copyStops();
    fireEvent.click(screen.getByRole('button', { name: 'Create Route (3 stops)' }));

    await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
    expect(createdStops()[1].notes).toBe('Gate code 1234');
  });

  it('creates the Stops with the notes as edited or cleared', async () => {
    await copyStops();

    fireEvent.change(screen.getByLabelText('Notes for stop 1, 1409/26 Cambridge St, Epping'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Notes for stop 3, 9 Grayson Rd, North Epping'), { target: { value: 'Beware of dog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Route (3 stops)' }));

    await waitFor(() => expect(createStopsForRoute).toHaveBeenCalled());
    const [cambridge, gloucester, grayson] = createdStops();
    expect(cambridge.notes).toBeUndefined();
    // Only spaces counts as cleared.
    expect(gloucester.notes).toBeUndefined();
    expect(grayson.notes).toBe('Beware of dog');
  });

  it('starts over from the source notes when the Stops are copied again', async () => {
    await copyStops();
    fireEvent.change(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping'), { target: { value: 'Changed' } });

    fireEvent.click(screen.getByRole('button', { name: 'Copy Stops' }));

    await waitFor(() => expect(screen.getByLabelText('Notes for stop 2, 20 Gloucester Road, Epping')).toHaveValue('Gate code 1234'));
  });

  describe('Route Code', () => {
    it('suggests a code once the codes in use are known, and warns with a link when it is typed over with another Route\'s', async () => {
      (listAllRoutes as jest.Mock).mockResolvedValue([{ id: 'old-route', customerId: 'c1', routeCode: 'OLD-1' }]);
      render(<NewRoutePage />);

      const field = await screen.findByLabelText(/route id/i);
      await waitFor(() => expect((field as HTMLInputElement).value).toMatch(/^W\d{2}-\d{2}-001$/));
      expect(screen.queryByText(/this code is already used by/i)).not.toBeInTheDocument();

      fireEvent.change(field, { target: { value: 'old-1' } });

      expect(await screen.findByText(/this code is already used by/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'another Route' })).toHaveAttribute('href', '/administrator/routes/detail?id=old-route');
    });

    it("says so, and suggests nothing, when the codes in use couldn't be read", async () => {
      (listAllRoutes as jest.Mock).mockRejectedValue(new Error('offline'));
      render(<NewRoutePage />);

      expect(await screen.findByText(/couldn't check existing route codes/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/route id/i)).toHaveValue('');
    });
  });
});
