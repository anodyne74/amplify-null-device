import { collectFinalized } from '../migrate-finalized-status.js';

describe('collectFinalized', () => {
  it('returns only finalized records from a page', () => {
    const records = [
      { id: '1', invoiceNumber: 'INV-001', status: 'finalized' },
      { id: '2', invoiceNumber: 'INV-002', status: 'draft' },
      { id: '3', invoiceNumber: 'INV-003', status: 'finalized' },
      { id: '4', invoiceNumber: 'INV-004', status: 'paid' },
    ];
    expect(collectFinalized(records)).toEqual([
      { id: '1', invoiceNumber: 'INV-001', status: 'finalized' },
      { id: '3', invoiceNumber: 'INV-003', status: 'finalized' },
    ]);
  });

  it('returns empty array when no finalized records', () => {
    expect(collectFinalized([{ id: '1', status: 'draft' }])).toEqual([]);
  });
});
