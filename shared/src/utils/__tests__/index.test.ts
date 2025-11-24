import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createResponse,
  isValidEmail,
  getCurrentTimestamp,
  sleep,
  retry,
  safeJsonParse,
} from '../index';

describe('Utils - createResponse', () => {
  it('should create response with message and data', () => {
    const result = createResponse('Success', { id: 1 });
    expect(result).toEqual({
      message: 'Success',
      data: { id: 1 },
    });
  });

  it('should create response with tools parameter', () => {
    const result = createResponse('Success', { id: 1 }, ['tool1', 'tool2']);
    expect(result).toEqual({
      message: 'Success',
      data: { id: 1 },
      tools: ['tool1', 'tool2'],
    });
  });

  it('should not include tools if not provided', () => {
    const result = createResponse('Success', { id: 1 });
    expect(result).not.toHaveProperty('tools');
  });

  it('should handle null data', () => {
    const result = createResponse('Success', null);
    expect(result).toEqual({
      message: 'Success',
      data: null,
    });
  });

  it('should handle complex data structures', () => {
    const complexData = {
      user: { name: 'John', age: 30 },
      items: [1, 2, 3],
      metadata: { created: new Date().toISOString() },
    };
    const result = createResponse('Complex', complexData);
    expect(result.data).toEqual(complexData);
  });
});

describe('Utils - isValidEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
    expect(isValidEmail('first+last@subdomain.example.com')).toBe(true);
    expect(isValidEmail('user_123@test-domain.org')).toBe(true);
  });

  it('should return false for invalid email addresses', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('invalid@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('invalid@domain')).toBe(false);
    expect(isValidEmail('invalid @domain.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isValidEmail('a@b.c')).toBe(true);
    expect(isValidEmail('test@localhost.localdomain')).toBe(true);
  });
});

describe('Utils - getCurrentTimestamp', () => {
  it('should return ISO format timestamp', () => {
    const timestamp = getCurrentTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should return valid Date object when parsed', () => {
    const timestamp = getCurrentTimestamp();
    const date = new Date(timestamp);
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).not.toBeNaN();
  });

  it('should return different timestamps when called multiple times', async () => {
    const timestamp1 = getCurrentTimestamp();
    await sleep(10);
    const timestamp2 = getCurrentTimestamp();
    expect(timestamp1).not.toBe(timestamp2);
  });
});

describe('Utils - sleep', () => {
  it('should delay execution for specified milliseconds', async () => {
    const start = Date.now();
    await sleep(100);
    const end = Date.now();
    const elapsed = end - start;
    expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small variance
    expect(elapsed).toBeLessThan(150);
  });

  it('should resolve without error', async () => {
    await expect(sleep(50)).resolves.toBeUndefined();
  });

  it('should handle zero delay', async () => {
    const start = Date.now();
    await sleep(0);
    const end = Date.now();
    expect(end - start).toBeLessThan(10);
  });
});

describe('Utils - retry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, 3, 10);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');
    
    const result = await retry(fn, 3, 10);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts exceeded', async () => {
    const error = new Error('Persistent failure');
    const fn = vi.fn().mockRejectedValue(error);
    
    await expect(retry(fn, 3, 10)).rejects.toThrow('Persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff delay', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));
    const start = Date.now();
    
    try {
      await retry(fn, 3, 50);
    } catch (error) {
      // Expected to fail
    }
    
    const elapsed = Date.now() - start;
    // First retry: 50ms, second retry: 100ms = ~150ms total
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(250);
  });

  it('should use default parameters', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle single attempt', async () => {
    const error = new Error('Single attempt fail');
    const fn = vi.fn().mockRejectedValue(error);
    
    await expect(retry(fn, 1, 10)).rejects.toThrow('Single attempt fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Utils - safeJsonParse', () => {
  it('should parse valid JSON string', () => {
    const json = '{"name":"John","age":30}';
    const result = safeJsonParse(json, {});
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should return fallback on invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('invalid json', fallback);
    expect(result).toEqual(fallback);
  });

  it('should handle empty string', () => {
    const fallback = { empty: true };
    const result = safeJsonParse('', fallback);
    expect(result).toEqual(fallback);
  });

  it('should parse JSON arrays', () => {
    const json = '[1,2,3,4,5]';
    const result = safeJsonParse(json, []);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('should parse JSON primitives', () => {
    expect(safeJsonParse('true', false)).toBe(true);
    expect(safeJsonParse('false', true)).toBe(false);
    expect(safeJsonParse('null', 'default')).toBe(null);
    expect(safeJsonParse('42', 0)).toBe(42);
    expect(safeJsonParse('"string"', 'default')).toBe('string');
  });

  it('should handle malformed JSON', () => {
    const fallback = { error: true };
    expect(safeJsonParse('{invalid}', fallback)).toEqual(fallback);
    expect(safeJsonParse('{"unclosed":', fallback)).toEqual(fallback);
    expect(safeJsonParse('undefined', fallback)).toEqual(fallback);
  });

  it('should preserve fallback type', () => {
    interface CustomType {
      id: number;
      name: string;
    }
    const fallback: CustomType = { id: 1, name: 'default' };
    const result = safeJsonParse('invalid', fallback);
    expect(result).toEqual(fallback);
  });
});

