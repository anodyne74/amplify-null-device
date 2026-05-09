export interface CustomerDefaultsInput {
  standingInstructions?: string;
  defaultNumberOfSigns?: number;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[];
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

  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return initials || normalized.slice(0, 2).toUpperCase();
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
  const defaultAgentInitials = defaultAgentName
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