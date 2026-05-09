import {
  generateAgentInitials,
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

  it('parses agent options from mixed line and comma input', () => {
    expect(parseAgentOptionsInput('Jamie Lee, Pat Doe\nAlex Roe')).toEqual([
      'Jamie Lee',
      'Pat Doe',
      'Alex Roe',
    ]);
  });
});