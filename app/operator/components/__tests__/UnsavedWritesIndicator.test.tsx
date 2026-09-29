import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnsavedWritesIndicator, unsavedLogoutWarning } from '@/app/operator/components/UnsavedWritesIndicator';
import { signRunOutbox, useSignRunOutbox, type OutboxEntry } from '@/lib/signRunOutbox';

jest.mock('@/lib/signRunOutbox', () => ({
  signRunOutbox: {
    resend: jest.fn(),
    discardRoute: jest.fn(),
    sendHeld: jest.fn(),
    discardHeld: jest.fn(),
  },
  useSignRunOutbox: jest.fn(),
}));

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveAllRoutes: () => ({ routes: [{ id: 'r1', routeCode: 'RT-101' }], loading: false, error: null }),
}));

function entry(fields: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'e1',
    routeId: 'r1',
    target: 'Route',
    recordId: 'r1',
    kind: 'completePlacement',
    patch: { executionPhase: 'pickup' },
    confirmedAt: Date.parse('2026-09-30T09:00:00.000Z'),
    attempts: 1,
    state: 'pending',
    ...fields,
  };
}

function withEntries(entries: OutboxEntry[]) {
  (useSignRunOutbox as jest.Mock).mockReturnValue({ entries, saved: {} });
}

describe('UnsavedWritesIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is hidden while everything has saved', () => {
    withEntries([]);
    const { container } = render(<UnsavedWritesIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the unsaved count and lists the actions by route when tapped', () => {
    withEntries([entry(), entry({ id: 'e2', target: 'Stop', recordId: 's1', kind: 'pickupStopDone' })]);
    render(<UnsavedWritesIndicator />);

    fireEvent.click(screen.getByRole('button', { name: '2 unsaved' }));

    expect(screen.getByRole('dialog')).toHaveTextContent("2 actions on this device haven't saved yet.");
    expect(screen.getByText('RT-101')).toBeInTheDocument();
    expect(screen.getByText('Complete placement')).toBeInTheDocument();
    expect(screen.getByText('Stop picked up')).toBeInTheDocument();
    expect(screen.getByText('Saving. This keeps trying until it gets through.')).toBeInTheDocument();
  });

  it('shows a refused route as not saved, with Try again and Discard', () => {
    withEntries([entry({ state: 'rejected' })]);
    render(<UnsavedWritesIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Not saved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(signRunOutbox.resend).toHaveBeenCalledWith('r1');

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(signRunOutbox.discardRoute).toHaveBeenCalledWith('r1');
  });

  it('opens by itself on actions held from earlier, offering Send or Discard', () => {
    withEntries([entry({ state: 'held' })]);
    render(<UnsavedWritesIndicator />);

    expect(screen.getByText("These actions from earlier weren't saved. Send or discard?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(signRunOutbox.sendHeld).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(signRunOutbox.discardHeld).toHaveBeenCalled();
  });
});

describe('unsavedLogoutWarning', () => {
  it.each([
    [0, null],
    [1, "1 action isn't saved yet. Stay signed in until they are?"],
    [3, "3 actions aren't saved yet. Stay signed in until they are?"],
  ])('for %i unsaved', (count, warning) => {
    expect(unsavedLogoutWarning(count)).toBe(warning);
  });
});
