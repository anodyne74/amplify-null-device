import {
  generateAgentInitials,
  getAgentBadgeTone,
  normalizeCustomerDefaults,
  parseAgentOptionsInput,
  setDefaultAgentOption,
} from './customerDefaults';

describe('customerDefaults', () => {
  it('generates initials from the default agent name', () => {
    expect(generateAgentInitials('Jamie Lee')).toBe('JL');
    expect(generateAgentInitials('Pat')).toBe('PA');
  });

  it('normalizes defaults and derives the default agent from the first agent option', () => {
    expect(
      normalizeCustomerDefaults({
        standingInstructions: '  Call first  ',
        defaultAgentName: ' Jamie Lee ',
        agentOptions: ['Pat Doe', 'jamie lee', ''],
      })
    ).toEqual({
      standingInstructions: 'Call first',
      defaultAgentName: 'Jamie Lee',
      // The first entry of agentOptions ("Pat Doe") is the default agent — an
      // admin-ordered, non-empty list is always authoritative over defaultAgentName.
      defaultAgentInitials: 'PD',
      agentOptions: ['Pat Doe', 'jamie lee'],
    });
  });

  it('reordering agent options changes the derived default agent (#2)', () => {
    expect(
      normalizeCustomerDefaults({
        agentOptions: setDefaultAgentOption(['BO', 'DM'], 'DM'),
      })
    ).toEqual({
      defaultAgentInitials: 'DM',
      agentOptions: ['DM', 'BO'],
    });
  });

  it('falls back to a legacy defaultAgentName when there are no agent options yet', () => {
    expect(
      normalizeCustomerDefaults({
        defaultAgentName: 'Bo',
        defaultAgentInitials: 'BO',
      })
    ).toEqual({
      defaultAgentName: 'Bo',
      defaultAgentInitials: 'BO',
      agentOptions: ['Bo'],
    });
  });

  it('sets an agent option as the default, moving it to the front of the list', () => {
    expect(setDefaultAgentOption(['BO', 'DM', 'KP'], 'BO')).toEqual(['BO', 'DM', 'KP']);
    expect(setDefaultAgentOption(['BO', 'DM', 'KP'], 'KP')).toEqual(['KP', 'BO', 'DM']);
    expect(setDefaultAgentOption(['BO', 'DM', 'KP'], 'DM')).toEqual(['DM', 'BO', 'KP']);
    expect(setDefaultAgentOption(['BO', 'DM', 'KP'], 'nope')).toEqual(['BO', 'DM', 'KP']);
  });

  it('parses agent options from mixed line and comma input', () => {
    expect(parseAgentOptionsInput('Jamie Lee, Pat Doe\nAlex Roe')).toEqual([
      'Jamie Lee',
      'Pat Doe',
      'Alex Roe',
    ]);
  });

  it('returns a deterministic badge tone for an agent name', () => {
    expect(getAgentBadgeTone('Jamie Lee')).toEqual(getAgentBadgeTone('Jamie Lee'));
    expect(getAgentBadgeTone('Jamie Lee')).not.toEqual(getAgentBadgeTone('Pat Doe'));
  });

  it('uses fixed tones for BO, DM, and KP initials', () => {
    expect(getAgentBadgeTone('BO')).toEqual({
      backgroundColor: 'var(--nd-status-planned)',
      color: 'var(--nd-text-inverse)',
    });
    expect(getAgentBadgeTone('DM')).toEqual({
      backgroundColor: 'var(--nd-status-active)',
      color: 'var(--nd-text-inverse)',
    });
    expect(getAgentBadgeTone('KP')).toEqual({
      backgroundColor: 'var(--nd-operator-accent)',
      color: 'var(--nd-text-inverse)',
    });
  });

  it('returns a safe fallback tone when no name is provided', () => {
    expect(getAgentBadgeTone()).toEqual({
      backgroundColor: 'var(--nd-status-completed)',
      color: 'var(--nd-bg-base)',
    });
  });
});