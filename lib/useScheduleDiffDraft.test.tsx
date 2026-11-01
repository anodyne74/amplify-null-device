import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { DraftMarks } from '@/lib/scheduleDiffDraft';
import { useScheduleDiffDraft, type LocateDraft } from '@/lib/useScheduleDiffDraft';

type Stop = DraftMarks & {
  address: string;
  addressStreetNumber?: string;
  addressStreet?: string;
  addressSuburb?: string;
  numberOfSigns?: number | null;
  agent?: string | null;
  notes?: string | null;
};

const stop = (address: string, number: string, street: string, extra: Partial<Stop> = {}): Stop => ({
  address,
  addressStreetNumber: number,
  addressStreet: street,
  addressSuburb: 'Hillview',
  ...extra,
});

const ALDER = stop('12 Alder Street, Hillview', '12', 'Alder Street', { numberOfSigns: 2 });
const GROVE = stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent');
const COPIED = [ALDER, GROVE];

const reading = (extra: object = {}) =>
  ({
    readAt: '2026-10-18T01:00:00.000Z',
    readBySub: 'sub',
    attachmentIndex: 0,
    rows: [{ address: '12 Alder Street, Hillview', numberOfSigns: 4 }, { address: '31 Hazel Road, Hillview' }],
    instructions: [],
    warnings: [],
    ...extra,
  }) as any;

function setup(options: { reading?: any; locate?: (drafts: LocateDraft[]) => Promise<{ stops: Stop[]; unpinned: number }> } = {}) {
  const locate = options.locate ?? jest.fn(async (drafts: LocateDraft[]) => ({ stops: drafts.map((d) => ({ ...stop(d.address, '31', 'Hazel Road'), ...d })) as Stop[], unpinned: 0 }));
  const hook = renderHook(
    ({ reading: current }) => {
      const [draft, setDraft] = useState<Stop[]>(COPIED.map((s, i) => ({ ...s, copiedFrom: i })));
      const diffDraft = useScheduleDiffDraft<Stop>({ reading: current, copiedStops: COPIED, draftStops: draft, setStops: setDraft, locate });
      return { ...diffDraft, draft };
    },
    { initialProps: { reading: options.reading ?? reading() } }
  );
  return { hook, locate };
}

describe('useScheduleDiffDraft', () => {
  it('works the reading out against the copy once', () => {
    const { hook } = setup();
    expect(hook.result.current.readingDiff?.diff.adds.map((row) => row.address)).toEqual(['31 Hazel Road, Hillview']);
    expect(hook.result.current.readingDiff?.diff.drops).toEqual([GROVE]);
  });

  it('takes a Drop out of the draft when accepted and puts the Stop back, edits and all, when rejected', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
    expect(hook.result.current.draft.map((s) => s.address)).toEqual([ALDER.address]);
    expect(hook.result.current.decisions['drop:1']).toBe('accepted');

    await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'rejected'));
    expect(hook.result.current.draft.map((s) => s.address)).toEqual([ALDER.address, GROVE.address]);
  });

  it('sets one field for an accepted Change and puts back what the copy had when rejected', async () => {
    const { hook } = setup();
    const line = { kind: 'change', index: 0, field: 'numberOfSigns' } as const;
    await act(() => hook.result.current.decide([line], 'accepted'));
    expect(hook.result.current.draft[0].numberOfSigns).toBe(4);
    await act(() => hook.result.current.decide([line], 'rejected'));
    expect(hook.result.current.draft[0].numberOfSigns).toBe(2);
  });

  it('adds a located Stop for an accepted Add and takes it out when rejected', async () => {
    const { hook, locate } = setup();
    await act(() => hook.result.current.decide([{ kind: 'add', index: 1 }], 'accepted'));
    expect(locate).toHaveBeenCalledTimes(1);
    expect(hook.result.current.draft.map((s) => s.address)).toContain('31 Hazel Road, Hillview');
    expect(hook.result.current.busy.size).toBe(0);

    await act(() => hook.result.current.decide([{ kind: 'add', index: 1 }], 'rejected'));
    expect(hook.result.current.draft.map((s) => s.address)).not.toContain('31 Hazel Road, Hillview');
  });

  it('says why an Add with no findable suburb was not added, and records no decision', async () => {
    const { hook } = setup({ locate: async () => ({ stops: [], unpinned: 0 }) });
    await act(() => hook.result.current.decide([{ kind: 'add', index: 1 }], 'accepted'));
    expect(hook.result.current.error).toMatch(/31 Hazel Road, Hillview has no suburb that could be found/);
    expect(hook.result.current.draft).toHaveLength(2);
    expect(hook.result.current.decisions['add:1']).toBeUndefined();
  });

  it('warns about an Add added without a pin', async () => {
    const { hook } = setup({ locate: async (drafts) => ({ stops: drafts.map((d) => stop(d.address, '31', 'Hazel Road')), unpinned: 1 }) });
    await act(() => hook.result.current.decide([{ kind: 'add', index: 1 }], 'accepted'));
    expect(hook.result.current.warnings[0]).toMatch(/created without a pin/);
    expect(hook.result.current.draft).toHaveLength(3);
  });

  it('discards an Add still being found on the map when the decisions are reset', async () => {
    let finish!: (value: { stops: Stop[]; unpinned: number }) => void;
    const { hook } = setup({ locate: () => new Promise((resolve) => (finish = resolve)) });
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.decide([{ kind: 'add', index: 1 }], 'accepted');
    });
    expect(hook.result.current.busy.has('add:1')).toBe(true);

    act(() => hook.result.current.reset());
    await act(async () => {
      finish({ stops: [stop('31 Hazel Road, Hillview', '31', 'Hazel Road')], unpinned: 0 });
      await pending;
    });
    expect(hook.result.current.draft).toHaveLength(2);
    expect(hook.result.current.decisions).toEqual({});
  });

  it('keeps an accepted Route-wide instruction and takes it back when rejected', async () => {
    const { hook } = setup({ reading: reading({ instructions: [{ text: 'Signs up by 8am' }] }) });
    await act(() => hook.result.current.decide([{ kind: 'instruction', index: 0 }], 'accepted'));
    expect(hook.result.current.acceptedRouteInstructions).toEqual({ 0: 'Signs up by 8am' });
    await act(() => hook.result.current.decide([{ kind: 'instruction', index: 0 }], 'rejected'));
    expect(hook.result.current.acceptedRouteInstructions).toEqual({});
  });

  it('adds a Stop instruction to that Stop\'s notes and takes it back out after the Stop was edited', async () => {
    const { hook } = setup({ reading: reading({ instructions: [{ text: 'Gate code 1234', address: '12 Alder Street, Hillview' }] }) });
    await act(() => hook.result.current.decide([{ kind: 'instruction', index: 0 }], 'accepted'));
    expect(hook.result.current.draft[0].notes).toBe('Gate code 1234');

    await act(() => hook.result.current.decide([{ kind: 'instruction', index: 0 }], 'rejected'));
    expect(hook.result.current.draft[0].notes).toBeFalsy();
  });

  it('does nothing for a line already decided the same way', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
    await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
    expect(hook.result.current.draft).toHaveLength(1);
  });

  it('reset clears decisions, messages and accepted instructions', async () => {
    const { hook } = setup({ locate: async () => ({ stops: [], unpinned: 0 }) });
    await act(() => hook.result.current.decide([{ kind: 'add', index: 1 }, { kind: 'drop', index: 1 }], 'accepted'));
    expect(hook.result.current.decisions).not.toEqual({});
    act(() => hook.result.current.reset());
    expect(hook.result.current.decisions).toEqual({});
    expect(hook.result.current.error).toBeNull();
  });

  describe('a new reading', () => {
    const newer = () => reading({ readAt: '2026-10-19T01:00:00.000Z' });

    it('clears the decisions and starts the draft over from the copy once a line was decided', async () => {
      const { hook } = setup();
      await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
      expect(hook.result.current.draft).toHaveLength(1);

      hook.rerender({ reading: newer() });
      expect(hook.result.current.decisions).toEqual({});
      expect(hook.result.current.draft.map((s) => s.address)).toEqual([ALDER.address, GROVE.address]);
      expect(hook.result.current.draft.map((s) => s.copiedFrom)).toEqual([0, 1]);
    });

    it('discards a hand edit made after copying when it starts over', async () => {
      const { hook } = setup();
      await act(() => hook.result.current.decide([{ kind: 'change', index: 0, field: 'numberOfSigns' }], 'accepted'));
      hook.rerender({ reading: newer() });
      expect(hook.result.current.draft[0].numberOfSigns).toBe(2);
    });

    it('leaves the draft alone when nothing had been decided', async () => {
      const { hook } = setup();
      const before = hook.result.current.draft;
      hook.rerender({ reading: newer() });
      expect(hook.result.current.draft).toBe(before);
    });

    it('leaves the draft alone when the same reading comes round again', async () => {
      const { hook } = setup();
      await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
      hook.rerender({ reading: reading() });
      expect(hook.result.current.draft).toHaveLength(1);
      expect(hook.result.current.decisions['drop:1']).toBe('accepted');
    });

    it('leaves nothing stale when it arrives while an Add is still being found', async () => {
      let finish!: (value: { stops: Stop[]; unpinned: number }) => void;
      const { hook } = setup({ locate: () => new Promise((resolve) => (finish = resolve)) });
      await act(() => hook.result.current.decide([{ kind: 'drop', index: 1 }], 'accepted'));
      let pending!: Promise<void>;
      act(() => {
        pending = hook.result.current.decide([{ kind: 'add', index: 1 }], 'accepted');
      });

      hook.rerender({ reading: newer() });
      await act(async () => {
        finish({ stops: [stop('31 Hazel Road, Hillview', '31', 'Hazel Road')], unpinned: 0 });
        await pending;
      });
      expect(hook.result.current.draft.map((s) => s.address)).toEqual([ALDER.address, GROVE.address]);
      expect(hook.result.current.decisions).toEqual({});
      expect(hook.result.current.busy.size).toBe(0);
    });
  });
});
