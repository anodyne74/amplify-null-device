import { reconcileSignRun } from './signRunReconciliation';
import { settleStopNotes } from './stopProgress';
import type { SignCountStop } from './signRunTotals';

function doneStop(numberOfSigns: number, missingSignsCount = 0): SignCountStop {
  return {
    numberOfSigns,
    missingSignsCount,
    notes: settleStopNotes('', 'pickup', 'complete', '2026-08-31T10:00:00.000Z'),
  };
}

function couldntCollectStop(numberOfSigns: number, missingSignsCount = 0): SignCountStop {
  return {
    numberOfSigns,
    missingSignsCount,
    notes: settleStopNotes('', 'pickup', 'couldntCollect', '2026-08-31T10:00:00.000Z', 'No access'),
  };
}

function pendingStop(numberOfSigns: number): SignCountStop {
  return { numberOfSigns, missingSignsCount: 0, notes: '' };
}

describe('reconcileSignRun', () => {
  it("counts done vs Couldn't Collect stops separately", () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5), doneStop(5), couldntCollectStop(5), pendingStop(5)]);
    expect(result.doneCount).toBe(2);
    expect(result.couldntCollectCount).toBe(1);
  });

  it('returnedTotal nets missing signs, only across completed stops', () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5, 1), doneStop(3, 0), couldntCollectStop(10)]);
    expect(result.returnedTotal).toBe(7);
  });

  it('missingTotal sums missingSignsCount across every stop, done or not', () => {
    const result = reconcileSignRun({ loadedSignsCount: 20 }, [doneStop(5, 1), couldntCollectStop(5, 2), pendingStop(5)]);
    expect(result.missingTotal).toBe(3);
  });

  it("counts the signs of a Stop removed at the door as returned, and those at a Couldn't Collect Stop as still on site", () => {
    const removedAtDoor = { numberOfSigns: 4, notes: '', removed: true, removedReason: 'Gate locked / no access' };
    const removedAtLoad = { numberOfSigns: 6, notes: '', removed: true };
    const result = reconcileSignRun({ loadedSignsCount: 14 }, [doneStop(5), couldntCollectStop(5), removedAtDoor, removedAtLoad]);
    expect(result.returnedTotal).toBe(9);
    expect(result.stillOnSite).toBe(5);
    expect(result.couldntCollectCount).toBe(1);
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
