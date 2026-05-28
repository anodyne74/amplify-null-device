export interface CustomerDefaultsInput {
  standingInstructions?: string;
  defaultNumberOfSigns?: number;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[];
}

export interface AgentBadgeTone {
  backgroundColor: string;
  color: string;
}

export function generateAgentInitials(agentName?: string) {
  const normalized = agentName?.trim();
  if (!normalized) return undefined;

  const words = normalized
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return undefined;
  }

  if (words.length === 1) {
    return words[0][0]?.toUpperCase();
  }

  const initials = words.map((word) => word[0]?.toUpperCase() ?? '').join('');
  return initials || normalized.slice(0, 2).toUpperCase();
}

export function getAgentBadgeTone(agentName?: string): AgentBadgeTone {
  const normalized = agentName?.trim().toUpperCase() ?? '';
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  const initials =
    (compact.length > 0 && compact.length <= 2
      ? compact
      : generateAgentInitials(agentName) ?? compact.slice(0, 2)) || 'AG';
  const fixedTones: Record<string, AgentBadgeTone> = {
    BO: { backgroundColor: 'var(--nd-status-planned)', color: 'var(--nd-text-inverse)' },
    DM: { backgroundColor: 'var(--nd-status-active)', color: 'var(--nd-text-inverse)' },
    KP: { backgroundColor: 'var(--nd-operator-accent)', color: 'var(--nd-text-inverse)' },
  };

  const fixedTone = fixedTones[initials];
  if (fixedTone) {
    return fixedTone;
  }

  const tones: AgentBadgeTone[] = [
    { backgroundColor: 'var(--nd-status-active)', color: 'var(--nd-text-inverse)' },
    { backgroundColor: 'var(--nd-operator-accent)', color: 'var(--nd-text-inverse)' },
    { backgroundColor: 'var(--nd-customer-accent)', color: 'var(--nd-bg-base)' },
    { backgroundColor: 'var(--nd-status-planned)', color: 'var(--nd-text-inverse)' },
    { backgroundColor: 'var(--nd-status-completed)', color: 'var(--nd-bg-base)' },
    { backgroundColor: 'var(--nd-status-danger)', color: 'var(--nd-text-inverse)' },
  ];

  const hash = initials
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return tones[hash % tones.length];
}

export function normalizeAgentOptions(agentOptions?: string[], defaultAgentName?: string) {
  const deduped = new Set<string>();
  const normalizedOptions: string[] = [];

  for (const option of agentOptions ?? []) {
    const trimmed = option.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (deduped.has(key)) continue;
    deduped.add(key);
    normalizedOptions.push(trimmed);
  }

  const normalizedDefaultAgent = defaultAgentName?.trim();
  if (normalizedDefaultAgent) {
    const defaultKey = normalizedDefaultAgent.toLowerCase();
    if (!deduped.has(defaultKey)) {
      normalizedOptions.unshift(normalizedDefaultAgent);
    }
  }

  return normalizedOptions.length > 0 ? normalizedOptions : undefined;
}

export function normalizeCustomerDefaults<T extends CustomerDefaultsInput>(input: T): T {
  const standingInstructions = input.standingInstructions?.trim() || undefined;
  const defaultAgentName = input.defaultAgentName?.trim() || undefined;
  const providedInitials = input.defaultAgentInitials?.trim();
  const defaultAgentInitials = providedInitials
    ? providedInitials.toUpperCase()
    : defaultAgentName
      ? generateAgentInitials(defaultAgentName)
      : undefined;
  const agentOptions = normalizeAgentOptions(input.agentOptions, defaultAgentName);

  return {
    ...input,
    standingInstructions,
    defaultAgentName,
    defaultAgentInitials,
    agentOptions,
  };
}

export function parseAgentOptionsInput(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((option) => option.trim())
    .filter(Boolean);
}

export function stringifyAgentOptions(agentOptions?: string[] | null) {
  return (agentOptions ?? []).join('\n');
}