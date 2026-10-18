import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ScheduleDiffPanel } from '../new/ScheduleDiffPanel';

const stop = (address: string, number: string, street: string, suburb: string) => ({
  address,
  addressStreetNumber: number,
  addressStreet: street,
  addressSuburb: suburb,
});

const reading = (...rows: object[]) => ({ readAt: '2026-10-18T01:00:00.000Z', readBySub: 'sub', attachmentIndex: 0, rows, warnings: [] }) as any;

const NO_DECISIONS = { decisions: {}, busy: new Set<string>(), onDecide: jest.fn() };

describe('ScheduleDiffPanel', () => {
  beforeEach(() => NO_DECISIONS.onDecide.mockClear());

  it('lists Adds, Drops, rows to check by hand and unit changes', () => {
    render(
      <ScheduleDiffPanel
        reading={reading(
          { address: '31 Hazel Road Riverbend', numberOfSigns: 5, agent: 'Alex', isAuction: true },
          { address: '5 Kent Street' },
          { address: '309/3 Birch Place, Hillview' },
          { address: '12 Alder Street, Hillview' }
        )}
        {...NO_DECISIONS}
        stops={[
          stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview'),
          stop('308/3 Birch Place, Hillview', '3', 'Birch Place', 'Hillview'),
          stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent', 'Hillview'),
        ]}
      />
    );

    expect(screen.getByText(/1 to add, 1 to drop, 0 to change, 1 to check, 1 unchanged\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Add/ })).toBeInTheDocument();
    expect(screen.getByText(/31 Hazel Road Riverbend · 5 signs · Alex/)).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Drop/ })).toBeInTheDocument();
    expect(screen.getByText('15 Grove Crescent, Hillview')).toBeInTheDocument();
    expect(screen.getByText('No suburb given')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Same Property, different unit' })).toBeInTheDocument();
    expect(screen.getByText('now 309/3 Birch Place, Hillview')).toBeInTheDocument();
  });

  it('says nothing reaches the Route until it is created, and leaves out headings with nothing under them', () => {
    render(
      <ScheduleDiffPanel {...NO_DECISIONS} reading={reading({ address: '12 Alder Street, Hillview' })} stops={[stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview')]} />
    );
    expect(screen.getByText(/0 to add, 0 to drop, 0 to change, 0 to check, 1 unchanged\. Accept the ones you want; nothing reaches the Route until you create it/)).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  describe('accepting and rejecting', () => {
    const ALDER = stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview');
    const GROVE = stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent', 'Hillview');
    const sheet = reading({ address: '12 Alder Street, Hillview' }, { address: '31 Hazel Road Riverbend' });
    const props = { reading: sheet, stops: [ALDER, GROVE], ...NO_DECISIONS };

    it('asks to accept or reject one Add or one Drop, naming its position in the reading or the copy', () => {
      render(<ScheduleDiffPanel {...props} />);

      fireEvent.click(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' }));
      expect(props.onDecide).toHaveBeenLastCalledWith([{ kind: 'add', index: 1 }], 'accepted');

      fireEvent.click(screen.getByRole('button', { name: 'Reject: drop 15 Grove Crescent, Hillview' }));
      expect(props.onDecide).toHaveBeenLastCalledWith([{ kind: 'drop', index: 1 }], 'rejected');
    });

    it('shows which lines are accepted and which rejected, and has none for lines to check by hand', () => {
      render(<ScheduleDiffPanel {...props} decisions={{ 'add:1': 'accepted', 'drop:1': 'rejected' }} />);
      expect(screen.getByRole('button', { name: 'Accept: add 31 Hazel Road Riverbend' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Reject: drop 15 Grove Crescent, Hillview' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Reject: add 31 Hazel Road Riverbend' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('accepts all the lines of one kind that have not been decided', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          reading={reading({ address: '31 Hazel Road Riverbend' }, { address: '2 Iris Lane, Hillview' }, { address: '9 Oak Way, Hillview' })}
          decisions={{ 'add:1': 'rejected' }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Accept all adds' }));
      expect(props.onDecide).toHaveBeenCalledWith(
        [{ kind: 'add', index: 0 }, { kind: 'add', index: 2 }],
        'accepted'
      );
    });

    it('is not busy-clickable while an Add is being found on the map', () => {
      render(<ScheduleDiffPanel {...props} busy={new Set(['add:1'])} />);
      expect(screen.getByRole('button', { name: 'Reject: add 31 Hazel Road Riverbend' })).toBeDisabled();
    });

    it('lists each section under its own heading', () => {
      render(<ScheduleDiffPanel {...props} />);
      const drop = screen.getByRole('heading', { name: /^Drop/ }).parentElement!;
      expect(within(drop).getByText('15 Grove Crescent, Hillview')).toBeInTheDocument();
    });
  });

  describe('Change lines', () => {
    const withAgent = (address: string, number: string, street: string, extra: object = {}) => ({
      ...stop(address, number, street, 'Hillview'),
      ...extra,
    });
    const ALDER = withAgent('12 Alder Street, Hillview', '12', 'Alder Street', { agent: 'Alex', numberOfSigns: 5 });
    const GROVE = withAgent('15 Grove Crescent, Hillview', '15', 'Grove Crescent', { agent: 'Blake', numberOfSigns: 5 });
    const props = { ...NO_DECISIONS, stops: [ALDER, GROVE] };

    it('lists a changed field with what it was and what it becomes, and asks to accept it by position and field', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          reading={reading({ address: '12 Alder Street, Hillview', agent: 'Alex', numberOfSigns: 3 }, { address: '15 Grove Crescent, Hillview', agent: 'Blake', numberOfSigns: 5 })}
        />
      );
      expect(screen.getByText(/1 to change/)).toBeInTheDocument();
      expect(screen.getByText('signs: 5 → 3')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Accept: change signs of 12 Alder Street, Hillview' }));
      expect(props.onDecide).toHaveBeenLastCalledWith([{ kind: 'change', index: 0, field: 'numberOfSigns' }], 'accepted');
    });

    it('does not list an agent the sheet writes as initials or with a typo, and flags one the Route does not have', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          reading={reading({ address: '12 Alder Street, Hillview', agent: 'AJ' }, { address: '15 Grove Crescent, Hillview', agent: 'Dana' })}
        />
      );
      expect(screen.queryByRole('button', { name: /change agent of 12 Alder/ })).not.toBeInTheDocument();
      expect(screen.getByText('agent: Blake → Dana')).toBeInTheDocument();
      expect(screen.getByText('New agent')).toBeInTheDocument();
    });

    it('accepts all the changes not yet decided', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          reading={reading({ address: '12 Alder Street, Hillview', numberOfSigns: 1, isAuction: true }, { address: '15 Grove Crescent, Hillview', numberOfSigns: 2 })}
          decisions={{ 'change:1:numberOfSigns': 'rejected' }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Accept all changes' }));
      expect(props.onDecide).toHaveBeenCalledWith(
        [{ kind: 'change', index: 0, field: 'numberOfSigns' }, { kind: 'change', index: 0, field: 'isAuction' }],
        'accepted'
      );
    });

    it('shows an Add’s agent as the Route spells it', () => {
      render(<ScheduleDiffPanel {...props} reading={reading({ address: '31 Hazel Road Riverbend', agent: 'AJ' })} />);
      expect(screen.getByText(/31 Hazel Road Riverbend · Alex/)).toBeInTheDocument();
    });
  });
});
