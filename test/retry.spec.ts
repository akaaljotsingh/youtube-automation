import { withRetry } from '../src/common/retry';

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and eventually succeeds', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('503 Service Unavailable');
      return 'ok';
    });
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent failures', async () => {
    const fn = jest.fn(async () => {
      throw new Error('400 Bad Request');
    });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});