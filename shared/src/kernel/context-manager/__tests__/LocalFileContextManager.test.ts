import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { LocalFileContextManager } from '../implementations/LocalFileContextManager';
import { Message, ConversationContext } from '../types';

describe('LocalFileContextManager', () => {
  const testBasePath = join(process.cwd(), 'test-context-storage');
  let manager: LocalFileContextManager;

  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
    mkdirSync(testBasePath, { recursive: true });

    manager = new LocalFileContextManager({ basePath: testBasePath });
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
  });

  describe('saveContext', () => {
    it('should save context to a file', async () => {
      const sessionId = 'test-session-1';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await manager.saveContext(sessionId, context);

      const filePath = join(testBasePath, `${sessionId}.json`);
      expect(existsSync(filePath)).toBe(true);
    });

    it('should save context with all messages', async () => {
      const sessionId = 'test-session-2';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await manager.saveContext(sessionId, context);

      const filePath = join(testBasePath, `${sessionId}.json`);
      const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(fileContent.messages).toHaveLength(2);
      expect(fileContent.messages[0].content).toBe('Hello');
      expect(fileContent.messages[1].content).toBe('Hi there!');
    });

    it('should save context with metadata', async () => {
      const sessionId = 'test-session-3';
      const now = new Date().toISOString();
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: now,
          updatedAt: now,
          customField: 'custom-value',
        },
      };

      await manager.saveContext(sessionId, context);

      const filePath = join(testBasePath, `${sessionId}.json`);
      const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(fileContent.metadata).toBeDefined();
      expect(fileContent.metadata.createdAt).toBe(now);
      expect(fileContent.metadata.customField).toBe('custom-value');
    });

    it('should overwrite existing context when saving again', async () => {
      const sessionId = 'test-session-4';
      const context1: ConversationContext = {
        sessionId,
        messages: [{ id: 'msg-1', role: 'user', content: 'First', timestamp: new Date().toISOString() }],
      };

      await manager.saveContext(sessionId, context1);

      const context2: ConversationContext = {
        sessionId,
        messages: [{ id: 'msg-2', role: 'user', content: 'Second', timestamp: new Date().toISOString() }],
      };

      await manager.saveContext(sessionId, context2);

      const filePath = join(testBasePath, `${sessionId}.json`);
      const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(fileContent.messages).toHaveLength(1);
      expect(fileContent.messages[0].content).toBe('Second');
    });
  });

  describe('getContext', () => {
    it('should return null if context file does not exist', async () => {
      const sessionId = 'non-existent-session';
      const context = await manager.getContext(sessionId);
      expect(context).toBeNull();
    });

    it('should retrieve saved context', async () => {
      const sessionId = 'test-session-5';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('Test message');
    });

    it('should retrieve context with metadata', async () => {
      const sessionId = 'test-session-6';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved?.metadata).toBeDefined();
      expect(retrieved?.metadata?.createdAt).toBeDefined();
    });
  });

  describe('addMessage', () => {
    it('should add message to existing context', async () => {
      const sessionId = 'test-session-7';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'First message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await manager.saveContext(sessionId, context);

      const newMessage: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Second message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[1].content).toBe('Second message');
    });

    it('should create new context if session does not exist when adding message', async () => {
      const sessionId = 'test-session-8';
      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'First message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('First message');
    });

    it('should update metadata updatedAt when adding message', async () => {
      const sessionId = 'test-session-9';
      const createdAt = new Date().toISOString();
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt,
        },
      };

      await manager.saveContext(sessionId, context);
       
      // Wait a bit to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 10));

      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.metadata?.createdAt).toBe(createdAt);
      expect(retrieved?.metadata?.updatedAt).toBeDefined();
      expect(retrieved?.metadata?.updatedAt).not.toBe(createdAt);
    });

    it('should preserve existing messages when adding new one', async () => {
      const sessionId = 'test-session-10';
      const context: ConversationContext = {
        sessionId,
        messages: [
          { id: 'msg-1', role: 'user', content: 'Message 1', timestamp: new Date().toISOString() },
          { id: 'msg-2', role: 'assistant', content: 'Message 2', timestamp: new Date().toISOString() },
        ],
      };

      await manager.saveContext(sessionId, context);

      const newMessage: Message = {
        id: 'msg-3',
        role: 'user',
        content: 'Message 3',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(3);
      expect(retrieved?.messages[0].content).toBe('Message 1');
      expect(retrieved?.messages[1].content).toBe('Message 2');
      expect(retrieved?.messages[2].content).toBe('Message 3');
    });
  });

  describe('file operations', () => {
    it('should create directory if it does not exist', async () => {
      const newBasePath = join(process.cwd(), 'new-test-directory');
      if (existsSync(newBasePath)) {
        rmSync(newBasePath, { recursive: true, force: true });
      }

      const newManager = new LocalFileContextManager({ basePath: newBasePath });
      const context: ConversationContext = {
        sessionId: 'test-session-11',
        messages: [],
      };

      await newManager.saveContext('test-session-11', context);

      expect(existsSync(newBasePath)).toBe(true);

      // Cleanup
      rmSync(newBasePath, { recursive: true, force: true });
    });

    it('should handle special characters in sessionId', async () => {
      const sessionId = 'test-session-with-special-chars-@#$%';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON gracefully if file is corrupted', async () => {
      const sessionId = 'corrupted-session';
      const filePath = join(testBasePath, `${sessionId}.json`);
      mkdirSync(testBasePath, { recursive: true });
      
      // Write invalid JSON
      require('fs').writeFileSync(filePath, 'invalid json content');

      await expect(manager.getContext(sessionId)).rejects.toThrow();
    });
  });
});

