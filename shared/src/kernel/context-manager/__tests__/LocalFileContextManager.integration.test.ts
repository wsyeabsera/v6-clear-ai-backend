import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { LocalFileContextManager } from '../implementations/LocalFileContextManager';
import {
  generateSessionId,
  createTestMessage,
  createTestContext,
  createTestMessages,
  cleanupLocalFile,
} from './integration/utils';

describe('LocalFileContextManager Integration Tests', () => {
  const testBasePath = join(process.cwd(), 'test-integration-storage');
  let manager: LocalFileContextManager;
  let testSessionIds: string[] = [];

  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
    mkdirSync(testBasePath, { recursive: true });

    manager = new LocalFileContextManager({ basePath: testBasePath });
    testSessionIds = [];
  });

  afterEach(async () => {
    // Clean up all test files
    if (testSessionIds.length > 0) {
      await cleanupLocalFile(manager, testSessionIds, testBasePath);
    }

    // Clean up test directory after each test
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
  });

  describe('Basic CRUD Operations', () => {
    it('should save context to file system and retrieve it', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Hello', 'user'),
        createTestMessage('Hi there!', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Hello');
      expect(retrieved?.messages[1].content).toBe('Hi there!');
    });

    it('should add message to existing context', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const initialContext = createTestContext(sessionId, [
        createTestMessage('First message', 'user'),
      ]);

      await manager.saveContext(sessionId, initialContext);

      const newMessage = createTestMessage('Second message', 'assistant');
      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[1].content).toBe('Second message');
    });

    it('should overwrite existing context when saving again', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context1 = createTestContext(sessionId, [
        createTestMessage('First', 'user'),
      ]);

      await manager.saveContext(sessionId, context1);

      const context2 = createTestContext(sessionId, [
        createTestMessage('Second', 'user'),
        createTestMessage('Third', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context2);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Second');
    });

    it('should return null for non-existent session', async () => {
      const sessionId = generateSessionId();
      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Multi-Session Management', () => {
    it('should handle multiple sessions in parallel', async () => {
      const sessionIds = Array.from({ length: 5 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Create contexts for all sessions
      const contexts = sessionIds.map((sessionId, index) =>
        createTestContext(sessionId, [
          createTestMessage(`Message for session ${index}`, 'user'),
        ])
      );

      // Save all contexts in parallel
      await Promise.all(
        contexts.map((context) => manager.saveContext(context.sessionId, context))
      );

      // Retrieve all contexts in parallel
      const retrieved = await Promise.all(
        sessionIds.map((id) => manager.getContext(id))
      );

      // Verify all contexts were saved and retrieved correctly
      retrieved.forEach((context, index) => {
        expect(context).not.toBeNull();
        expect(context?.sessionId).toBe(sessionIds[index]);
        expect(context?.messages[0].content).toContain(`session ${index}`);
      });
    });

    it('should maintain file isolation between sessions', async () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      testSessionIds.push(sessionId1, sessionId2);

      const context1 = createTestContext(sessionId1, [
        createTestMessage('Session 1 message', 'user'),
      ]);

      const context2 = createTestContext(sessionId2, [
        createTestMessage('Session 2 message', 'user'),
      ]);

      await manager.saveContext(sessionId1, context1);
      await manager.saveContext(sessionId2, context2);

      const retrieved1 = await manager.getContext(sessionId1);
      const retrieved2 = await manager.getContext(sessionId2);

      expect(retrieved1?.messages[0].content).toBe('Session 1 message');
      expect(retrieved2?.messages[0].content).toBe('Session 2 message');
      expect(retrieved1?.sessionId).not.toBe(retrieved2?.sessionId);
    });

    it('should handle multiple messages across sessions', async () => {
      const sessionIds = Array.from({ length: 3 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Add multiple messages to each session
      for (const sessionId of sessionIds) {
        for (let i = 0; i < 3; i++) {
          await manager.addMessage(
            sessionId,
            createTestMessage(`Message ${i + 1}`, i % 2 === 0 ? 'user' : 'assistant')
          );
        }
      }

      // Verify all sessions have correct message counts
      for (const sessionId of sessionIds) {
        const context = await manager.getContext(sessionId);
        expect(context?.messages).toHaveLength(3);
      }
    });
  });

  describe('File System Edge Cases', () => {
    it('should create directory if it does not exist', async () => {
      const newBasePath = join(process.cwd(), 'new-test-directory-integration');
      if (existsSync(newBasePath)) {
        rmSync(newBasePath, { recursive: true, force: true });
      }

      const newManager = new LocalFileContextManager({ basePath: newBasePath });
      const sessionId = generateSessionId();

      const context = createTestContext(sessionId, [
        createTestMessage('Test', 'user'),
      ]);

      await newManager.saveContext(sessionId, context);

      expect(existsSync(newBasePath)).toBe(true);

      // Cleanup
      rmSync(newBasePath, { recursive: true, force: true });
    });

    it('should handle special characters in sessionId', async () => {
      const sessionId = `test-session-${Date.now()}-@#$%^&*()`;
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Special chars test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    it('should handle long session IDs', async () => {
      const sessionId = 'a'.repeat(200) + Date.now();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Long ID test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
    });
  });

  describe('Conversation Flow', () => {
    it('should maintain full conversation history', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const messages = createTestMessages(10);

      for (const message of messages) {
        await manager.addMessage(sessionId, message);
      }

      const context = await manager.getContext(sessionId);
      expect(context?.messages).toHaveLength(10);
      expect(context?.messages[0].content).toBe('Test message 1');
      expect(context?.messages[9].content).toBe('Test message 10');
    });

    it('should preserve metadata across operations', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(
        sessionId,
        [createTestMessage('Test', 'user')],
        {
          customField: 'custom-value',
          userId: 'user-123',
        }
      );

      await manager.saveContext(sessionId, context);

      await manager.addMessage(sessionId, createTestMessage('Another message', 'assistant'));

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.metadata?.customField).toBe('custom-value');
      expect(retrieved?.metadata?.userId).toBe('user-123');
      expect(retrieved?.metadata?.updatedAt).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should clean up test files after test completion', async () => {
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Cleanup test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);

      // Verify file exists
      const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = join(testBasePath, `${sanitizedId}.json`);
      expect(existsSync(filePath)).toBe(true);

      // Cleanup will be done in afterEach
    });
  });
});

