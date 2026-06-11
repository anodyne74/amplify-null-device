import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminActionButton from '@/app/components/AdminActionButton';

describe('AdminActionButton', () => {
  it('renders child label by default', () => {
    render(<AdminActionButton>Save</AdminActionButton>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('sets button type to button by default', () => {
    render(<AdminActionButton>Action</AdminActionButton>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveAttribute('type', 'button');
  });

  it('uses loading label and busy state while loading', () => {
    render(
      <AdminActionButton isLoading loadingLabel="Saving...">
        Save
      </AdminActionButton>
    );

    const button = screen.getByRole('button', { name: 'Saving...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('falls back to child label while loading when loadingLabel is not provided', () => {
    render(<AdminActionButton isLoading>Save</AdminActionButton>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('maps variant styles to expected class names', () => {
    const { rerender } = render(<AdminActionButton variant="primary">Primary</AdminActionButton>);
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('adminBtn', 'adminBtnPrimary');

    rerender(<AdminActionButton variant="secondary">Secondary</AdminActionButton>);
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('adminBtn', 'adminBtnSecondary');

    rerender(<AdminActionButton variant="ghost">Ghost</AdminActionButton>);
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass('adminBtn', 'adminBtnGhost');

    rerender(<AdminActionButton variant="danger">Danger</AdminActionButton>);
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('adminBtn', 'adminBtnDanger');
  });

  it('calls onClick when enabled and does not call while loading', () => {
    const onClick = jest.fn();
    const { rerender } = render(<AdminActionButton onClick={onClick}>Run</AdminActionButton>);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <AdminActionButton onClick={onClick} isLoading loadingLabel="Running...">
        Run
      </AdminActionButton>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Running...' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
