import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import PendingApprovalPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('aws-amplify/auth', () => ({
  signOut: jest.fn(),
}));

describe('PendingApprovalPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('shows a static no-access message', () => {
    render(<PendingApprovalPage />);

    expect(screen.getByText('No portal access yet')).toBeInTheDocument();
    expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
  });

  it('signs out and redirects home', async () => {
    render(<PendingApprovalPage />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/');
    });
  });
});
