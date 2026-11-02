import { addToDraft, dropFromDraft, orderDraft, removeAddFromDraft, restoreToDraft } from '@/lib/scheduleDiffDraft';

const copied = (address: string, copiedFrom: number, notes?: string) => ({ address, copiedFrom, notes });
const added = (address: string, fromRow: number) => ({ address, fromRow });

const COPY = [copied('A', 0), copied('B', 1), copied('C', 2)];

describe('scheduleDiffDraft', () => {
  it('puts copied Stops first in their original order, then Adds in sheet order', () => {
    expect(orderDraft([added('Z', 5), copied('C', 2), added('Y', 1), copied('A', 0)]).map((s) => s.address)).toEqual(['A', 'C', 'Y', 'Z']);
  });

  it('drops a copied Stop and hands back what it was', () => {
    const { draft, dropped } = dropFromDraft([copied('A', 0), copied('B', 1, 'edited')], 1);
    expect(draft.map((s) => s.address)).toEqual(['A']);
    expect(dropped).toEqual(copied('B', 1, 'edited'));
  });

  it('has nothing to hand back when the Stop is already out', () => {
    expect(dropFromDraft([copied('A', 0)], 4)).toEqual({ draft: [copied('A', 0)], dropped: undefined });
  });

  it('restores a dropped Stop to its place, edits kept, ahead of any Adds', () => {
    const draft = [copied('A', 0), copied('C', 2), added('Y', 1)];
    expect(restoreToDraft(draft, copied('B', 1, 'edited')).map((s) => s.address)).toEqual(['A', 'B', 'C', 'Y']);
  });

  it('does not restore a Stop twice', () => {
    expect(restoreToDraft(COPY, COPY[1])).toHaveLength(3);
  });

  it('adds in sheet order however the lines were accepted, and not twice', () => {
    let draft = [...COPY] as Array<ReturnType<typeof copied> & { fromRow?: number }>;
    draft = addToDraft(draft, added('late', 7) as any);
    draft = addToDraft(draft, added('early', 2) as any);
    draft = addToDraft(draft, added('early', 2) as any);
    expect(draft.map((s) => s.address)).toEqual(['A', 'B', 'C', 'early', 'late']);
  });

  it('takes an Add back out', () => {
    expect(removeAddFromDraft([...COPY, added('Y', 3)] as any, 3).map((s: any) => s.address)).toEqual(['A', 'B', 'C']);
  });

  it('leaves the copy unchanged when no line is accepted', () => {
    expect(orderDraft(COPY)).toEqual(COPY);
  });
});
