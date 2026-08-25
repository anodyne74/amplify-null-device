export interface StopSummary {
  address?: string | null;
  formattedAddress?: string | null;
  agent?: string | null;
  numberOfSigns?: number | null;
  sequence?: number | null;
}

export interface AgentStopGroup {
  agent: string;
  stops: StopSummary[];
  signCount: number;
}

/**
 * Cleans up a stop's address for display — strips state/postcode and "Australia"
 * so property lists read like a run sheet rather than a geocoder result. Falls
 * back to the first two comma-separated segments (usually street + suburb).
 */
export function formatStopProperty(stop: StopSummary): string {
  const baseAddress = (stop.formattedAddress || stop.address || 'Unknown property').trim();
  const parts = baseAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b\s*\d{4}\b/gi, '')
        .replace(/\bAustralia\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  if (parts.length === 0) return 'Unknown property';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}

/**
 * Groups stops by agent for the "signs per stop" breakdown — used both by the
 * on-screen invoice preview and (optionally) by generated-PDF stop tables.
 * Stops with no agent set are bucketed under "Unassigned" rather than dropped,
 * so sign counts always reconcile with the flat total.
 */
export function groupStopsByAgent(stops: StopSummary[]): AgentStopGroup[] {
  const order: string[] = [];
  const byAgent = new Map<string, StopSummary[]>();

  for (const stop of stops) {
    const agent = stop.agent?.trim() || 'Unassigned';
    if (!byAgent.has(agent)) {
      byAgent.set(agent, []);
      order.push(agent);
    }
    byAgent.get(agent)!.push(stop);
  }

  return order.map((agent) => {
    const agentStops = byAgent.get(agent)!;
    return {
      agent,
      stops: agentStops,
      signCount: agentStops.reduce((sum, stop) => sum + (stop.numberOfSigns ?? 0), 0),
    };
  });
}
