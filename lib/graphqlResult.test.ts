import { DataError, resultData, withDataError } from './graphqlResult';

describe('resultData', () => {
  it('returns the data, or null when there is none', () => {
    expect(resultData({ data: { id: 'x' } })).toEqual({ id: 'x' });
    expect(resultData({ data: null, errors: [] })).toBeNull();
  });

  it('throws when the result carries errors, even alongside data', () => {
    expect(() => resultData({ data: [{ id: 'x' }], errors: [{ message: 'boom' }] })).toThrow();
  });
});

describe('withDataError', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns what the operation returns', async () => {
    await expect(withDataError('Failed.', async () => 42)).resolves.toBe(42);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('turns result errors into a DataError whose cause is the raw errors, logged once', async () => {
    const errors = [{ message: 'Not Authorized to access field' }];

    const failure = await withDataError('Failed to load things.', async () => resultData({ errors })).catch(
      (err) => err
    );

    expect(failure).toBeInstanceOf(DataError);
    expect(failure.message).toBe('Failed to load things.');
    expect(failure.cause).toBe(errors);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load things.', errors);
  });

  it('wraps a thrown error as the cause', async () => {
    const networkError = new Error('Network error');

    const failure = await withDataError('Failed.', async () => {
      throw networkError;
    }).catch((err) => err);

    expect(failure).toBeInstanceOf(DataError);
    expect(failure.cause).toBe(networkError);
  });

  it('passes a DataError thrown inside through unchanged, without logging', async () => {
    const denied = new DataError('Access denied');

    await expect(
      withDataError('Failed.', async () => {
        throw denied;
      })
    ).rejects.toBe(denied);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
