import { act, fireEvent, render, screen } from '@testing-library/react';
import ToastProvider, { useToast } from '@/app/components/ToastProvider';

function ToastProbe() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Saved', 'success')}>success</button>
      <button onClick={() => showToast('Failed', 'error')}>error</button>
    </div>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a success toast and auto-dismisses it', () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('success'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps error toasts until manually dismissed', () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('error'));
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws if useToast is used outside the provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastProbe />)).toThrow('useToast must be used within ToastProvider');
    consoleError.mockRestore();
  });
});
