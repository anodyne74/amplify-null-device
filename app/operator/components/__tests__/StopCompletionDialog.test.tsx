import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { StopCompletionDialog } from '../StopCompletionDialog';
import type { Stop } from '@/amplify/types';

const stop: Stop = {
  id: 'stop-1',
  routeId: 'route-1',
  sequence: 1,
  address: '100 First St',
  formattedAddress: '100 First St, Melbourne VIC',
  numberOfSigns: 4,
  agent: 'AB',
};

describe('StopCompletionDialog', () => {
  it('renders nothing when there is no stop', () => {
    const { container } = render(
      <StopCompletionDialog
        stop={null}
        phase="placement"
        onComplete={jest.fn()}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the address, facts, and completes the stop', () => {
    const onComplete = jest.fn();

    render(
      <StopCompletionDialog
        stop={stop}
        phase="placement"
        onComplete={onComplete}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('100 First St, Melbourne VIC')).toBeInTheDocument();
    expect(screen.getByText('4 signs · Agent AB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Signs Placed' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses "Signs Picked Up" wording during the pickup phase', () => {
    render(
      <StopCompletionDialog
        stop={stop}
        phase="pickup"
        onComplete={jest.fn()}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Signs Picked Up' })).toBeInTheDocument();
  });

  it("moves to the reason step when Can't place is pressed and calls onProblem with the chosen reason", () => {
    const onProblem = jest.fn();

    render(
      <StopCompletionDialog
        stop={stop}
        phase="placement"
        onComplete={jest.fn()}
        onProblem={onProblem}
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: "Can't place" }));

    expect(screen.getByText("Why can't the signs go up?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Property not ready' }));
    expect(onProblem).toHaveBeenCalledWith('Property not ready');
  });

  it("offers Couldn't collect, with Pickup's own reasons, during the pickup phase", () => {
    const onProblem = jest.fn();
    render(<StopCompletionDialog stop={stop} phase="pickup" onComplete={jest.fn()} onProblem={onProblem} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: "Couldn't collect" }));

    expect(screen.getByText("Why couldn't the signs be collected?")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Property not ready' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Access blocked' }));
    expect(onProblem).toHaveBeenCalledWith('Access blocked');
  });

  it('opens directly on the reason step when initialStep is "reason"', () => {
    render(
      <StopCompletionDialog
        stop={stop}
        phase="placement"
        initialStep="reason"
        onComplete={jest.fn()}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText("Why can't the signs go up?")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signs Placed' })).not.toBeInTheDocument();
  });

  it('resets to the action step when a different stop is opened', () => {
    const { rerender } = render(
      <StopCompletionDialog
        stop={stop}
        phase="placement"
        initialStep="reason"
        onComplete={jest.fn()}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText("Why can't the signs go up?")).toBeInTheDocument();

    const otherStop: Stop = { ...stop, id: 'stop-2', address: '200 Second Ave', formattedAddress: undefined };
    rerender(
      <StopCompletionDialog
        stop={otherStop}
        phase="placement"
        initialStep="action"
        onComplete={jest.fn()}
        onProblem={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('200 Second Ave')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signs Placed' })).toBeInTheDocument();
  });
});
