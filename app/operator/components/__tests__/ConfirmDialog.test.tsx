import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        time="07:37"
        title="Start load"
        summary="Starting load of 45 signs at 22 Dryburgh St."
        onCancel={jest.fn()}
        onOk={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the time, title and summary, and calls onOk', () => {
    const onOk = jest.fn();

    render(
      <ConfirmDialog
        open
        time="07:37"
        title="Start load"
        summary="Starting load of 45 signs at 22 Dryburgh St."
        onCancel={jest.fn()}
        onOk={onOk}
      />
    );

    expect(screen.getByText('07:37')).toBeInTheDocument();
    expect(screen.getByText('Start load')).toBeInTheDocument();
    expect(screen.getByText('Starting load of 45 signs at 22 Dryburgh St.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel and not onOk when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const onOk = jest.fn();

    render(
      <ConfirmDialog
        open
        time="07:37"
        title="Complete load"
        summary="45 signs loaded at 22 Dryburgh St."
        onCancel={onCancel}
        onOk={onOk}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOk).not.toHaveBeenCalled();
  });

  it('disables Cancel and shows a loading OK button while busy', () => {
    render(
      <ConfirmDialog
        open
        time="07:37"
        title="Start load"
        summary="Starting load of 45 signs at 22 Dryburgh St."
        busy
        onCancel={jest.fn()}
        onOk={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
  });
});
