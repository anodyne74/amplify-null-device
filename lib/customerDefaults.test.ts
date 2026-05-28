import {
  generateAgentInitials,
  getAgentBadgeTone,
  normalizeCustomerDefaults,
  parseAgentOptionsInput,
} from './customerDefaults';

describe('customerDefaults', () => {
  it('generates initials from the default agent name', () => {
    expect(generateAgentInitials('Jamie Lee')).toBe('JL');
    expect(generateAgentInitials('Pat')).toBe('P');
  });

  it('normalizes defaults and includes the default agent in options', () => {
    expect(
      normalizeCustomerDefaults({
        standingInstructions: '  Call first  ',
        defaultAgentName: ' Jamie Lee ',
        agentOptions: ['Pat Doe', 'jamie lee', ''],
      })
    ).toEqual({
      standingInstructions: 'Call first',
      defaultAgentName: 'Jamie Lee',
      defaultAgentInitials: 'JL',
      agentOptions: ['Pat Doe', 'jamie lee'],
    });
  });

  it('preserves provided default agent initials', () => {
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