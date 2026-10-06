import { callApi } from '@/lib/apiClient';

/**
 * Asks the server to send a just-finalised Route's Missing Signs Report
 * (app/api/missing-signs-report), which decides whether one is due. Called
 * once Finalise has saved, by the Operator's outbox or the administrator's
 * Finalise. Best-effort: a failure is only logged and never undoes Finalise.
 */
export async function requestMissingSignsReport(routeId: string): Promise<void> {
  try {
    await callApi('/api/missing-signs-report', { routeId });
  } catch (error) {
    console.error(`Asking for Route ${routeId}'s Missing Signs Report failed:`, error);
  }
}
