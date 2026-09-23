import { reconcileSignRun } from './signRunReconciliation';
import { PICKUP_DONE_MARKER, PICKUP_SKIPPED_MARKER, upsertMarker } from './stopExecutionMarkers';
import type { SignCountStop } from './signRunTotals';

function doneStop(numberOfSigns: number, missingSignsCount = 0): SignCountStop {
  return {
    numberOfSigns,
    missingSignsCount,
    notes: upsertMarker('', PICKUP_DONE_MARKER, '2026-08-31T10:00:00.000Z'),
  };
}

function skippedStop(numberOfSigns: number, missingSignsCount = 0): SignCountStop {
  return {
    numberOfSigns,
    missingSignsCount,
    notes: upsertMarker('', PICKUP_SKIPPED_MARKER, '2026-08-31T10:00:00.000Z', 'No access'),
  };
}

function pendingStop(numberOfSigns: number): SignCountStop {
  return { numberOfSigns, missingSignsCount: 0, notes: '' };
}

describe('reconcileSignRun', () => {
  it('counts done vs skipped stops separately', () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5), doneStop(5), skippedStop(5), pendingStop(5)]);
    expect(result.doneCount).toBe(2);
    expect(result.skipCount).toBe(1);
  });

  it('returnedTotal nets missing signs, only across completed stops', () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5, 1), doneStop(3, 0), skippedStop(10)]);
    expect(result.returnedTotal).toBe(7);
  });

  it('missingTotal sums missingSignsCount across every stop, done or not', () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5, 1), skippedStop(5, 2), pendingStop(5)]);
    expect(result.missingTotal).toBe(3);
  });

  it('stillOnSite is loadedTotal minus returned and missing, floored at 0', () => {
    const result = reconcileSignRun({ loadedSignsCount: 10 }, [doneStop(4, 1)]);
    expect(result.loadedTotal).toBe(10);
    expect(result.returnedTotal).toBe(3);
    expect(result.missingTotal).toBe(1);
    expect(result.stillOnSite).toBe(6);
  });

  it('floors stillOnSite at 0 rather than going negative', () => {
    const result = reconcileSignRun({ loadedSignsCount: 2 }, [doneStop(10, 0)]);
    expect(result.stillOnSite).toBe(0);
  });

  it('treats a missing loadedSignsCount as 0', () => {
    const result = reconcileSignRun({}, [doneStop(4)]);
    expect(result.loadedTotal).toBe(0);
  });
});
