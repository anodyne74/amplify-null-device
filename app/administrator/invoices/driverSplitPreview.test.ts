import { computeDriverSplitPreview } from './driverSplitPreview';

describe('computeDriverSplitPreview', () => {
  it('splits the billed amount by the given percentage', () => {
    const result = computeDriverSplitPreview({ billedAmount: 1000, driverSplitPercent: 28.5 });
    expect(result).toEqual({ splitPercent: 28.5, driverShare: 285, retained: 715 });
  });

  it('treats a missing split percent as 0%, retaining the full amount', () => {
    const result = computeDriverSplitPreview({ billedAmount: 500, driverSplitPercent: null });
    expect(result).toEqual({ splitPercent: 0, driverShare: 0, retained: 500 });
  });

  it('treats a non-finite billed amount as 0', () => {
    const result = computeDriverSplitPreview({ billedAmount: Number.NaN, driverSplitPercent: 20 });
    expect(result).toEqual({ splitPercent: 20, driverShare: 0, retained: 0 });
  });
});
