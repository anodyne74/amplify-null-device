import { checkRouteDateBlocked } from './routeScheduleGuard';
import { listOperatorAvailabilityBlocks } from '@/lib/queries/ListOperatorAvailabilityBlocks';
import { listCustomerClosureBlocks } from '@/lib/queries/ListCustomerClosureBlocks';

jest.mock('@/lib/queries/ListOperatorAvailabilityBlocks', () => ({
  listOperatorAvailabilityBlocks: jest.fn(),
}));
jest.mock('@/lib/queries/ListCustomerClosureBlocks', () => ({
  listCustomerClosureBlocks: jest.fn(),
}));

describe('checkRouteDateBlocked', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
    (listCustomerClosureBlocks as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
  });

  it('returns not blocked when neither calendar has a block on the date', async () => {
    const result = await checkRouteDateBlocked('cust-1', '2026-09-15');
    expect(result).toEqual({ blocked: false });
  });

  it('returns blocked with type "no_drivers" when Null Device has no drivers that day', async () => {
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', customerId: 'cust-1', date: '2026-09-15', reason: 'Driver on leave' }],
      errors: undefined,
    });

    const result = await checkRouteDateBlocked('cust-1', '2026-09-15');
    expect(result).toEqual({ blocked: true, type: 'no_drivers', reason: 'Driver on leave' });
  });

  it('returns blocked with type "closed" when the customer agency is closed that day', async () => {
    (listCustomerClosureBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', customerId: 'cust-1', date: '2026-09-15', reason: 'Christmas shutdown' }],
      errors: undefined,
    });

    const result = await checkRouteDateBlocked('cust-1', '2026-09-15');
    expect(result).toEqual({ blocked: true, type: 'closed', reason: 'Christmas shutdown' });
  });

  it('prefers the no-drivers block when both sides have blocked the same day', async () => {
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', customerId: 'cust-1', date: '2026-09-15', reason: undefined }],
      errors: undefined,
    });
    (listCustomerClosureBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b2', customerId: 'cust-1', date: '2026-09-15', reason: undefined }],
      errors: undefined,
    });

    const result = await checkRouteDateBlocked('cust-1', '2026-09-15');
    expect(result.blocked).toBe(true);
    expect(result.type).toBe('no_drivers');
  });

  it('ignores blocks on other dates', async () => {
    (listOperatorAvailabilityBlocks as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', customerId: 'cust-1', date: '2026-09-16', reason: 'Public holiday' }],
      errors: undefined,
    });

    const result = await checkRouteDateBlocked('cust-1', '2026-09-15');
    expect(result).toEqual({ blocked: false });
  });
});
