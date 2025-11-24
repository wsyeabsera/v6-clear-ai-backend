import { describe, it, expect } from 'vitest';
import * as ContextManagerExports from '../index';

describe('Context Manager Index Exports', () => {
  it('should export IContextManager interface type', () => {
    // Type test - will fail at compile time if not exported
    const mockManager: ContextManagerExports.IContextManager = {
      saveContext: async () => {},
      getContext: async () => ({
        sessionId: 'test',
        userId: 'test',
        messages: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      addMessage: async () => {},
      getMessages: async () => [],
      deleteContext: async () => {},
      updateMetadata: async () => {},
    };
    expect(mockManager).toBeDefined();
  });

  it('should export ContextManagerFactory', () => {
    expect(ContextManagerExports.ContextManagerFactory).toBeDefined();
    expect(ContextManagerExports.ContextManagerFactory.create).toBeDefined();
    expect(typeof ContextManagerExports.ContextManagerFactory.create).toBe('function');
  });

  it('should export LocalFileContextManager', () => {
    expect(ContextManagerExports.LocalFileContextManager).toBeDefined();
    expect(typeof ContextManagerExports.LocalFileContextManager).toBe('function');
  });

  it('should export MongoContextManager', () => {
    expect(ContextManagerExports.MongoContextManager).toBeDefined();
    expect(typeof ContextManagerExports.MongoContextManager).toBe('function');
  });

  it('should export PineconeContextManager', () => {
    expect(ContextManagerExports.PineconeContextManager).toBeDefined();
    expect(typeof ContextManagerExports.PineconeContextManager).toBe('function');
  });

  it('should export ConversationContext type', () => {
    // Type test for ConversationContext
    const context: ContextManagerExports.ConversationContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      messages: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(context).toBeDefined();
  });

  it('should export Message type', () => {
    // Type test for Message
    const message: ContextManagerExports.Message = {
      role: 'user',
      content: 'test message',
      timestamp: new Date(),
    };
    expect(message).toBeDefined();
  });

  it('should be able to create instances via factory', () => {
    const localManager = ContextManagerExports.ContextManagerFactory.create(
      ContextManagerExports.ContextManagerType.LOCAL,
      { basePath: './test-storage' }
    );
    expect(localManager).toBeInstanceOf(ContextManagerExports.LocalFileContextManager);
  });
});

