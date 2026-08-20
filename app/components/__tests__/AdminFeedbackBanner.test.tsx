import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminFeedbackBanner from '@/app/components/AdminFeedbackBanner';

describe('AdminFeedbackBanner', () => {
  it('renders nothing when message is missing', () => {
    const { container } = render(<AdminFeedbackBanner message={null} tone="error" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders success tone with status role and dismiss action', () => {
    const onDismiss = jest.fn();

    render(
      <AdminFeedbackBanner
        message="Saved"
        tone="success"
        dismissLabel="Close"
        dismissAriaLabel="Close success message"
        onDismiss={onDismiss}
      />
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close success message' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders warning tone with alert role and no dismiss button by default', () => {
    render(<AdminFeedbackBanner message="Heads up" tone="warning" />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss message' })).not.toBeInTheDocument();
  });
});
