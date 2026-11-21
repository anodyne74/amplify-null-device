import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministratorDriversPage from '../page';
import { listOperators } from '@/lib/queries/ListOperators';
import { listOperatorTextConsents } from '@/lib/queries/ListOperatorTextConsents';
import { updateOperator } from '@/lib/queries/UpdateOperator';
import { ApiError, callApi } from '@/lib/apiClient';
import { listAllRoutes, listAllStops } from '@/lib/routes';
import { listAllCustomers } from '@/lib/customers';

jest.mock('@/app/components/OperatorRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  callApi: jest.fn(),
}));

jest.mock('@/lib/queries/ListOperators', () => ({
  listOperators: jest.fn(),
}));

jest.mock('@/lib/queries/UpdateOperator', () => ({
  updateOperator: jest.fn(),
}));

jest.mock('@/lib/queries/ListOperatorTextConsents', () => ({
  listOperatorTextConsents: jest.fn(),
}));

jest.mock('@/lib/customers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/routes', () => ({
  listAllRoutes: jest.fn(),
  listAllStops: jest.fn(),
}));

const operatorUsers = {
  users: [
    { id: 'sub-1', name: 'Jane Driver', email: 'jane@nulldevice.dev' },
    { id: 'sub-2', name: 'Amir Driver', email: 'amir@nulldevice.dev' },
  ],
};

/** Answers /api/admin/users by action; anything not listed gets the operator group. */
function mockUsersApi(byAction: Record<string, () => unknown> = {}) {
  (callApi as jest.Mock).mockImplementation(async (_path: string, body: { action: string }) =>
    byAction[body.action] ? byAction[body.action]() : operatorUsers
  );
}

describe('Administrator Operators page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUsersApi({ createUser: () => ({ user: { sub: 'new-sub' }, created: true, emailSent: true }) });

    (listOperators as jest.Mock).mockResolvedValue([
      {
        id: 'sub-1',
        name: 'Jane Driver',
        email: 'jane@nulldevice.dev',
        phone: '+61412345678',
        status: 'active',
        vehicleAndRego: 'Van 1 · ABC123',
        driverSplitPercent: 30,
        payCycle: 'fortnightly',
        paySplitOnCompletedStopsOnly: true,
        assignedCustomerIds: ['cust-1'],
      },
      {
        id: 'sub-2',
        name: 'Amir Driver',
        email: 'amir@nulldevice.dev',
        status: 'onboarding',
        assignedCustomerIds: [],
      },
    ]);

    (listAllCustomers as jest.Mock).mockResolvedValue([
      { id: 'cust-1', name: 'Harcourts Epping' },
      { id: 'cust-2', name: 'Ray White Eastwood' },
    ]);

    (listOperatorTextConsents as jest.Mock).mockResolvedValue([
      { id: 'sub-1', textConsent: 'yes', textConsentMobile: '+61412345678' },
    ]);
    (updateOperator as jest.Mock).mockResolvedValue({ id: 'sub-1' });
    (listAllRoutes as jest.Mock).mockResolvedValue([]);
    (listAllStops as jest.Mock).mockResolvedValue([]);
  });

  it('lists drivers merged with their Operator profile fields', async () => {
    render(<AdministratorDriversPage />);

    expect(await screen.findByText('Van 1 · ABC123')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Onboarding').length).toBeGreaterThanOrEqual(1);
  });

  it('computes the route-based stat tiles and the per-driver monthly route count', async () => {
    const now = new Date();
    const isoThisMonth = new Date(now.getFullYear(), now.getMonth(), 10).toISOString();

    (listAllRoutes as jest.Mock).mockResolvedValue([
      { id: 'r1', assignedOperatorSub: 'sub-1', actualEndTime: isoThisMonth, actualDurationMinutes: 240 },
      { id: 'r2', assignedOperatorSub: 'sub-1', actualEndTime: isoThisMonth, actualDurationMinutes: 300 },
    ]);
    (listAllStops as jest.Mock).mockResolvedValue([
      { id: 's1', routeId: 'r1' },
      { id: 's2', routeId: 'r2' },
      { id: 's3', routeId: 'r2' },
    ]);

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    expect(screen.getByText('3 stops serviced')).toBeInTheDocument();
    expect(screen.getByText('4h 30m')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    expect(screen.getByText(/2 routes this month/)).toBeInTheDocument();
  });

  it('selects a driver and saves profile edits', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    fireEvent.change(screen.getByLabelText(/vehicle and rego/i), { target: { value: 'Van 1 · XYZ999' } });
    fireEvent.click(screen.getByRole('button', { name: /save operator/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ vehicleAndRego: 'Van 1 · XYZ999' })
      );
    });
  });

  it.each(['0412 345 678', '+61 412 345 678', '61412345678'])(
    'saves the mobile %s in international form and shows it in local form',
    async (typed) => {
      render(<AdministratorDriversPage />);

      await screen.findByText('Van 1 · ABC123');
      fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
      fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: typed } });
      fireEvent.click(screen.getByRole('button', { name: /save operator/i }));

      await waitFor(() => {
        expect(updateOperator).toHaveBeenCalledWith('sub-1', expect.objectContaining({ phone: '+61412345678' }));
      });
      await waitFor(() => expect(screen.getByLabelText('Mobile')).toHaveValue('0412 345 678'));
    }
  );

  it('shows a stored mobile in local form', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    expect(screen.getByLabelText('Mobile')).toHaveValue('0412 345 678');
  });

  it('saves a cleared mobile as no number', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save operator/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', expect.objectContaining({ phone: null }));
    });
  });

  it('refuses a number that is not an Australian mobile and saves nothing', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '02 9876 5432' } });
    fireEvent.click(screen.getByRole('button', { name: /save operator/i }));

    expect(await screen.findByText(/Mobile must be an Australian mobile number/)).toBeInTheDocument();
    expect(updateOperator).not.toHaveBeenCalled();
  });

  it('assigns a new customer to the selected driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    fireEvent.change(screen.getByLabelText(/customer to assign/i), { target: { value: 'cust-2' } });
    fireEvent.click(screen.getByRole('button', { name: /assign customer/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: ['cust-1', 'cust-2'] });
    });
  });

  it('removes an assigned customer', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    await screen.findByText('Harcourts Epping');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { assignedCustomerIds: [] });
    });
  });

  it('deactivates the selected driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => {
      expect(updateOperator).toHaveBeenCalledWith('sub-1', { status: 'inactive' });
    });
  });

  it('resends the invite for an onboarding driver', async () => {
    mockUsersApi({ resendInvite: () => ({ emailSent: true }) });

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Amir Driver' }));
    fireEvent.click(screen.getByRole('button', { name: /resend invite/i }));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/api/admin/users', {
        action: 'resendInvite',
        email: 'amir@nulldevice.dev',
        groupName: 'operator',
        name: 'Amir Driver',
      });
    });

    expect(await screen.findByText(/invitation resent to amir@nulldevice.dev/i)).toBeInTheDocument();
  });

  it('does not offer a resend invite action for an active driver', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Configure Jane Driver' }));

    expect(screen.queryByRole('button', { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no drivers', async () => {
    (callApi as jest.Mock).mockResolvedValue({ users: [] });
    (listOperators as jest.Mock).mockResolvedValue([]);

    render(<AdministratorDriversPage />);

    expect(await screen.findByText(/no operators yet/i)).toBeInTheDocument();
  });

  it('invites a new driver via the operator group', async () => {
    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new operator/i), {
      target: { value: 'new-driver@nulldevice.dev' },
    });
    fireEvent.change(screen.getByLabelText(/optional display name for new operator/i), {
      target: { value: 'New Driver' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith('/api/admin/users', {
        action: 'createUser',
        email: 'new-driver@nulldevice.dev',
        name: 'New Driver',
        groupName: 'operator',
      });
    });

    expect(await screen.findByText(/they’ll get an email with a link to set their password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email for new operator/i)).toHaveValue('');
  });

  it('tells the admin when the login was created but the invitation email failed to send', async () => {
    mockUsersApi({ createUser: () => ({ user: { sub: 'new-sub' }, created: true, emailSent: false }) });

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new operator/i), {
      target: { value: 'new-driver@nulldevice.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    expect(await screen.findByText(/invitation email could not be sent/i)).toBeInTheDocument();
  });

  it('shows an error and keeps the form filled in when inviting a driver fails', async () => {
    mockUsersApi({
      createUser: () => {
        throw new ApiError('Could not create a login for this email.', 400);
      },
    });

    render(<AdministratorDriversPage />);

    await screen.findByText('Van 1 · ABC123');

    fireEvent.change(screen.getByLabelText(/email for new operator/i), {
      target: { value: 'broken@nulldevice.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send invite$/i }));

    expect(await screen.findByText('Could not create a login for this email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email for new operator/i)).toHaveValue('broken@nulldevice.dev');
  });

  describe('Text Consent', () => {
    const consentCalls = () => (callApi as jest.Mock).mock.calls.filter(([path]) => path === '/api/operator/text-consent');

    async function open(name: string) {
      render(<AdministratorDriversPage />);
      fireEvent.click(await screen.findByRole('button', { name: `Configure ${name}` }));
    }

    it('shows yes, no and not yet asked in the Texts column', async () => {
      (listOperators as jest.Mock).mockResolvedValue([
        { id: 'sub-1', name: 'Jane Driver', phone: '+61412345678', status: 'active', assignedCustomerIds: [] },
        { id: 'sub-2', name: 'Amir Driver', phone: '+61411111111', status: 'active', assignedCustomerIds: [] },
      ]);
      (listOperatorTextConsents as jest.Mock).mockResolvedValue([
        { id: 'sub-1', textConsent: 'yes', textConsentMobile: '+61412345678' },
        { id: 'sub-2', textConsent: 'no', textConsentMobile: '+61411111111' },
      ]);
      (callApi as jest.Mock).mockImplementation(async () => ({
        users: [...operatorUsers.users, { id: 'sub-3', name: 'Zed Driver', email: 'zed@nulldevice.dev' }],
      }));
      render(<AdministratorDriversPage />);
      const rows = await screen.findAllByRole('row');
      const text = rows.map((r) => r.textContent ?? '');
      expect(text.find((t) => t.includes('Jane Driver'))).toContain('Yes');
      expect(text.find((t) => t.includes('Amir Driver'))).toMatch(/No/);
      expect(text.find((t) => t.includes('Zed Driver'))).toContain('Not yet asked');
    });

    it('shows not yet asked when the stored answer was given for a different number', async () => {
      (listOperatorTextConsents as jest.Mock).mockResolvedValue([
        { id: 'sub-1', textConsent: 'yes', textConsentMobile: '+61499999999' },
      ]);
      await open('Jane Driver');
      const jane = screen.getAllByRole('row').find((r) => r.textContent?.includes('Jane Driver'));
      expect(jane).toHaveTextContent('Not yet asked');
    });

    it('turns texts off without asking for confirmation', async () => {
      await open('Jane Driver');
      fireEvent.click(await screen.findByRole('button', { name: 'Turn texts off' }));
      await waitFor(() => expect(consentCalls()).toHaveLength(1));
      expect(consentCalls()[0][1]).toEqual({ consent: 'no', operatorId: 'sub-1' });
      expect(await screen.findByRole('button', { name: 'Turn texts on' })).toBeInTheDocument();
    });

    it('does not turn texts on until the Operator\'s agreement is confirmed', async () => {
      (listOperatorTextConsents as jest.Mock).mockResolvedValue([]);
      await open('Jane Driver');
      fireEvent.click(await screen.findByRole('button', { name: 'Turn texts on' }));
      const record = screen.getByRole('button', { name: 'Record yes' });
      expect(record).toBeDisabled();
      expect(consentCalls()).toHaveLength(0);

      fireEvent.click(screen.getByLabelText('The Operator agreed to this, directly'));
      fireEvent.click(record);
      await waitFor(() => expect(consentCalls()).toHaveLength(1));
      expect(consentCalls()[0][1]).toEqual({ consent: 'yes', operatorId: 'sub-1', operatorAgreed: true });
      expect(await screen.findByRole('button', { name: 'Turn texts off' })).toBeInTheDocument();
    });

    it('cannot turn texts on for an Operator with no mobile', async () => {
      await open('Amir Driver');
      expect(await screen.findByText('Add an Australian mobile number before recording a yes')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Turn texts on' })).not.toBeInTheDocument();
    });

    it('shows the error and keeps the answer when the change is refused', async () => {
      (callApi as jest.Mock).mockImplementation(async (path: string) => {
        if (path === '/api/operator/text-consent') throw new Error('Could not record that');
        return operatorUsers;
      });
      await open('Jane Driver');
      fireEvent.click(await screen.findByRole('button', { name: 'Turn texts off' }));
      expect(await screen.findByText('Could not record that')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Turn texts off' })).toBeInTheDocument();
    });

    it('returns to not yet asked once a different mobile is saved', async () => {
      await open('Jane Driver');
      fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '0499 999 999' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save operator' }));
      await waitFor(() => expect(updateOperator).toHaveBeenCalled());
      const jane = () => screen.getAllByRole('row').find((r) => r.textContent?.includes('Jane Driver'));
      await waitFor(() => expect(jane()).toHaveTextContent('Not yet asked'));
    });

    it('keeps the answer when the same mobile is saved again', async () => {
      await open('Jane Driver');
      fireEvent.click(screen.getByRole('button', { name: 'Save operator' }));
      await waitFor(() => expect(updateOperator).toHaveBeenCalled());
      const jane = screen.getAllByRole('row').find((r) => r.textContent?.includes('Jane Driver'));
      expect(jane).toHaveTextContent('Yes');
    });
  });
});
