import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomeCard from '../WelcomeCard';
import { getUserSettings, upsertUserSettings } from '@/lib/userSettings';
import { REQUESTS_EMAIL } from '@/lib/publicAppConfig';

let mockOnFlags: string[] = ['customer-help'];
let mockFlagsLoading = false;
let mockRole: 'account_owner' | 'read_only' = 'account_owner';
let mockContextLoading = false;

jest.mock('@/lib/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ isOn: (name: string) => mockOnFlags.includes(name), loading: mockFlagsLoading }),
}));
jest.mock('@/lib/useCustomerPortalContext', () => ({
  useCustomerPortalContext: () => ({ userId: 'user-1', role: mockRole, loading: mockContextLoading }),
}));
jest.mock('@/lib/userSettings', () => ({
  getUserSettings: jest.fn(),
  upsertUserSettings: jest.fn(),
}));

const findCard = () => screen.findByRole('region', { name: 'Welcome' });

describe('WelcomeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnFlags = ['customer-help'];
    mockFlagsLoading = false;
    mockRole = 'account_owner';
    mockContextLoading = false;
    (getUserSettings as jest.Mock).mockResolvedValue(null);
    (upsertUserSettings as jest.Mock).mockResolvedValue({ id: 'settings-1' });
  });

  it('greets a user who has never saved settings, such as a new Customer User', async () => {
    render(<WelcomeCard />);

    await findCard();
    expect(getUserSettings).toHaveBeenCalledWith('user-1');
  });

  it('tells the story from email to invoice and links to Getting started', async () => {
    render(<WelcomeCard />);
    await findCard();

    expect(screen.getByRole('link', { name: REQUESTS_EMAIL })).toHaveAttribute('href', `mailto:${REQUESTS_EMAIL}`);
    expect(screen.getByRole('link', { name: 'Routes' })).toHaveAttribute('href', '/customer/routes');
    expect(screen.getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/customer/invoices');
    expect(screen.getByRole('link', { name: 'Getting started' })).toHaveAttribute('href', '/customer/help/getting-started');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it("shows a read-only user the same card without linking to Invoices, which they can't open", async () => {
    mockRole = 'read_only';
    render(<WelcomeCard />);
    await findCard();

    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.getByText(/We invoice you once the Route is complete/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('speaks only to the Customer User', async () => {
    render(<WelcomeCard />);
    const card = await findCard();

    expect(card.textContent).not.toMatch(/operator|staff|driver|administrator|order|booking|job/i);
  });

  it('stays hidden once the user has dismissed it', async () => {
    (getUserSettings as jest.Mock).mockResolvedValue({ id: 'settings-1', welcomeDismissedAt: '2026-10-01T00:00:00.000Z' });
    render(<WelcomeCard />);

    await waitFor(() => expect(getUserSettings).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('records the dismissal against the user and hides', async () => {
    render(<WelcomeCard />);
    await findCard();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(upsertUserSettings).toHaveBeenCalledWith('user-1', { welcomeDismissedAt: expect.any(String) });
    const [, { welcomeDismissedAt }] = (upsertUserSettings as jest.Mock).mock.calls[0];
    expect(new Date(welcomeDismissedAt).toISOString()).toBe(welcomeDismissedAt);
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it("comes back with a message when the dismissal can't be saved", async () => {
    (upsertUserSettings as jest.Mock).mockRejectedValue(new Error('Failed to save settings.'));
    render(<WelcomeCard />);
    await findCard();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await findCard()).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't dismiss this. Try again.");
  });

  it("doesn't flash before the user's settings are known", () => {
    (getUserSettings as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<WelcomeCard />);

    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it("stays hidden when the user's settings can't be read", async () => {
    (getUserSettings as jest.Mock).mockRejectedValue(new Error('Failed to load settings.'));
    render(<WelcomeCard />);

    await waitFor(() => expect(getUserSettings).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument();
  });

  it('is not there, and reads nothing, while customer-help is off', async () => {
    mockOnFlags = [];
    const { container } = render(<WelcomeCard />);

    expect(container).toBeEmptyDOMElement();
    expect(getUserSettings).not.toHaveBeenCalled();
  });

  it('waits for the role and flags before reading settings', () => {
    mockContextLoading = true;
    mockFlagsLoading = true;
    const { container } = render(<WelcomeCard />);

    expect(container).toBeEmptyDOMElement();
    expect(getUserSettings).not.toHaveBeenCalled();
  });
});
