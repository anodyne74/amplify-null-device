import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from '@/app/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  const baseProps = {
    open: true,
    title: 'Archive route?',
    message: 'This route will no longer appear in active lists.',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, message, and buttons when open', () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByRole('alertdialog', { name: 'Archive route?' })).toBeInTheDocument();
    expect(screen.getByText('This route will no longer appear in active lists.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('focuses the cancel button on open', () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('calls onConfirm when confirm is clicked', () => {
    render(<ConfirmDialog {...baseProps} confirmLabel="Archive" />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel is clicked', () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape', () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    render(<ConfirmDialog {...baseProps} busy />);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
