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

    expect(screen.getByText(/1 to add, 1 to drop, 0 to change, 0 instructions, 1 to check, 1 unchanged\./)).toBeInTheDocument();
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
    expect(screen.getByText(/0 to add, 0 to drop, 0 to change, 0 instructions, 0 to check, 1 unchanged\. Accept the ones you want; nothing reaches the Route until you create it/)).toBeInTheDocument();
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

  describe('Instructions', () => {
    const ALDER = { ...stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview'), notes: 'Side gate' };
    const withInstructions = (instructions: object[]) => ({ ...reading({ address: '12 Alder Street, Hillview' }), instructions });
    const props = { ...NO_DECISIONS, stops: [ALDER] };

    it('lists an instruction in the customer’s words with where it goes and what is there now', () => {
      render(<ScheduleDiffPanel {...props} reading={withInstructions([{ text: 'Ring the bell first', address: '12 Alder St, Hillview', source: 'email' }])} />);
      expect(screen.getByText('For 12 Alder Street, Hillview:')).toBeInTheDocument();
      expect(screen.getByText(/Ring the bell first/)).toBeInTheDocument();
      expect(screen.getByText(/from the email/)).toBeInTheDocument();
      expect(screen.getByText(/Stop.s note now: .Side gate./)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Accept: instruction 1' }));
      expect(props.onDecide).toHaveBeenLastCalledWith([{ kind: 'instruction', index: 0 }], 'accepted');
    });

    it('shows no section at all when there are no instructions, or an older reading has none', () => {
      const { rerender } = render(<ScheduleDiffPanel {...props} reading={withInstructions([])} />);
      expect(screen.queryByRole('heading', { name: /^Instructions/ })).not.toBeInTheDocument();
      rerender(<ScheduleDiffPanel {...props} reading={reading({ address: '12 Alder Street, Hillview' })} />);
      expect(screen.queryByRole('heading', { name: /^Instructions/ })).not.toBeInTheDocument();
    });

    it('leaves out what is already said, and offers no button for what has nowhere to go', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          standingInstructions="Call the office on arrival"
          reading={withInstructions([
            { text: 'side gate', address: '12 Alder Street, Hillview' },
            { text: 'Call the office on arrival' },
            { text: 'Mind the dog', address: '99 Nowhere Road, Hillview' },
          ])}
        />
      );
      expect(screen.queryByText(/side gate/i, { selector: 'span' })).not.toBeInTheDocument();
      expect(screen.getByText(/No Stop at that address on the Route yet/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Accept|Reject): instruction/ })).not.toBeInTheDocument();
    });

    it('accepts all the instructions that have somewhere to go', () => {
      render(
        <ScheduleDiffPanel
          {...props}
          reading={withInstructions([{ text: 'A', address: '12 Alder Street, Hillview' }, { text: 'B' }, { text: 'C', address: '99 Nowhere Road, Hillview' }])}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Accept all instructions' }));
      expect(props.onDecide).toHaveBeenCalledWith([{ kind: 'instruction', index: 0 }, { kind: 'instruction', index: 1 }], 'accepted');
    });
  });

  describe('Totals', () => {
    const ALDER = stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview');
    const sheet = (statedTotals: object | undefined) =>
      ({ ...reading({ address: '12 Alder Street, Hillview', numberOfSigns: 5, agent: 'Alex' }), statedTotals }) as any;

    it('warns, naming both figures, when the rows do not add up to the sheet’s total', () => {
      render(<ScheduleDiffPanel {...NO_DECISIONS} stops={[ALDER]} reading={sheet({ signs: 8 })} />);
      expect(screen.getByRole('alert')).toHaveTextContent('add up to 5 signs, but the sheet says 8');
    });

    it('says nothing for a sheet that adds up, or one that prints no totals', () => {
      const { rerender } = render(<ScheduleDiffPanel {...NO_DECISIONS} stops={[ALDER]} reading={sheet({ signs: 5, agents: [{ agent: 'Alex', signs: 5 }] })} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      rerender(<ScheduleDiffPanel {...NO_DECISIONS} stops={[ALDER]} reading={sheet(undefined)} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
