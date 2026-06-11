import { act, renderHook } from '@testing-library/react';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';

describe('useInvoiceUiState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('initializes expected default values', () => {
    const { result } = renderHook(() => useInvoiceUiState());

    expect(result.current.loading).toBe(true);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.successMessage).toBeNull();
    expect(result.current.uploadingId).toBeNull();
    expect(result.current.uploadError).toBeNull();
    expect(result.current.pdfActionLoadingId).toBeNull();
    expect(result.current.emailingInvoiceId).toBeNull();
    expect(result.current.pendingUploadInvoiceId).toBeNull();
    expect(result.current.pendingUploadInvoiceIdRef.current).toBeNull();
  });

  it('clears success message after timeout', () => {
    const { result } = renderHook(() => useInvoiceUiState());

    act(() => {
      result.current.setSuccessMessage('Saved');
    });

    expect(result.current.successMessage).toBe('Saved');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.successMessage).toBeNull();
  });

  it('does not schedule clear when success message is not set', () => {
    const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

    renderHook(() => useInvoiceUiState());

    expect(setTimeoutSpy).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });
});
