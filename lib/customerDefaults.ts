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
    return words[0].slice(0, 2).toUpperCase();
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

/** 1-2 letter initials for an agent badge, with a series of fallbacks for short/odd
 * names so the badge is never blank. Used by StopCard and the Driver Sign Run
 * driving-mode screens' "THEN" list agent bubbles. */
export function getAgentBadgeInitials(agentName: string) {
  const compact = agentName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const generated = (generateAgentInitials(agentName) ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  if (generated.length >= 2) return generated.slice(0, 2);
  if (generated.length === 1 && compact.length >= 2) return `${generated}${compact[1]}`;
  if (compact.length >= 2) return compact.slice(0, 2);
  if (compact.length === 1) return `${compact}G`;
  return 'AG';
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

  // Legacy fallback: a customer created before the agent-list UI existed may only
  // have a defaultAgentName and no agentOptions at all — seed the list with it so
  // it isn't silently dropped. Once agentOptions exist, list order (set via
  // AgentOptionsEditor's Up/Down reordering) is authoritative, so defaultAgentName
  // is never injected into a non-empty list — that would fight the admin's
  // explicit ordering and silently change their chosen default agent.
  const normalizedDefaultAgent = defaultAgentName?.trim();
  if (normalizedDefaultAgent && normalizedOptions.length === 0) {
    normalizedOptions.push(normalizedDefaultAgent);
  }

  return normalizedOptions.length > 0 ? normalizedOptions : undefined;
}

export function normalizeCustomerDefaults<T extends CustomerDefaultsInput>(input: T): T {
  const standingInstructions = input.standingInstructions?.trim() || undefined;
  const defaultAgentName = input.defaultAgentName?.trim() || undefined;
  const agentOptions = normalizeAgentOptions(input.agentOptions, defaultAgentName);

  // The default agent is simply the first entry of the (admin-ordered) agent list —
  // reordering via AgentOptionsEditor's Up/Down buttons is how admins change a
  // customer's default agent. Falls back to a provided/legacy value only when
  // there's no agent list at all.
  const providedInitials = input.defaultAgentInitials?.trim();
  const firstAgent = agentOptions?.[0];
  const defaultAgentInitials = firstAgent
    ? (generateAgentInitials(firstAgent) ?? firstAgent.slice(0, 2).toUpperCase())
    : providedInitials
      ? providedInitials.toUpperCase()
      : defaultAgentName
        ? generateAgentInitials(defaultAgentName)
        : undefined;

  return {
    ...input,
    standingInstructions,
    defaultAgentName,
    defaultAgentInitials,
    agentOptions,
  };
}

/** Add an agent option, case-insensitively deduped against what's already there.
 * New agents are appended to the end — the first entry is the customer's default
 * agent (see normalizeCustomerDefaults), so appending never silently changes it. */
export function addAgentOption(options: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return options;
  return options.some((option) => option.toLowerCase() === trimmed.toLowerCase())
    ? options
    : [...options, trimmed];
}

export function removeAgentOption(options: string[], value: string): string[] {
  return options.filter((option) => option !== value);
}

/** Move an agent option earlier/later in the list — reordering is how admins
 * change which agent is the default (always index 0, see normalizeCustomerDefaults). */
export function moveAgentOption(options: string[], index: number, direction: 'up' | 'down'): string[] {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= options.length || targetIndex < 0 || targetIndex >= options.length) {
    return options;
  }

  const reordered = [...options];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved);
  return reordered;
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