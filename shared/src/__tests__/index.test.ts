import { describe, it, expect } from 'vitest';
import * as MainExports from '../index';

describe('Main Index Exports', () => {
  it('should export ApiResponse type', () => {
    // Type test - this will fail at compile time if type is not exported
    const response: MainExports.ApiResponse<string> = {
      message: 'test',
      data: 'test data',
    };
    expect(response).toBeDefined();
  });

  it('should export RabbitMQ client', () => {
    expect(MainExports.RabbitMQClient).toBeDefined();
    expect(typeof MainExports.RabbitMQClient).toBe('function');
  });

  it('should export utility functions', () => {
    expect(MainExports.createResponse).toBeDefined();
    expect(typeof MainExports.createResponse).toBe('function');
    
    expect(MainExports.isValidEmail).toBeDefined();
    expect(typeof MainExports.isValidEmail).toBe('function');
    
    expect(MainExports.getCurrentTimestamp).toBeDefined();
    expect(typeof MainExports.getCurrentTimestamp).toBe('function');
    
    expect(MainExports.sleep).toBeDefined();
    expect(typeof MainExports.sleep).toBe('function');
    
    expect(MainExports.retry).toBeDefined();
    expect(typeof MainExports.retry).toBe('function');
    
    expect(MainExports.safeJsonParse).toBeDefined();
    expect(typeof MainExports.safeJsonParse).toBe('function');
  });

  it('should successfully use exported utilities', () => {
    // Test that exports actually work
    const response = MainExports.createResponse('test', { value: 1 });
    expect(response.message).toBe('test');
    expect(response.data).toEqual({ value: 1 });
    
    expect(MainExports.isValidEmail('test@example.com')).toBe(true);
    
    const timestamp = MainExports.getCurrentTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    
    const parsed = MainExports.safeJsonParse('{"key":"value"}', {});
    expect(parsed).toEqual({ key: 'value' });
  });
});

