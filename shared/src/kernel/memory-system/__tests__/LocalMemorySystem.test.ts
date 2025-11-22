import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMemorySystem } from '../implementations/LocalMemorySystem';
import { Memory, Message } from '../types';

describe('LocalMemorySystem', () => {
  let memorySystem: LocalMemorySystem;

  const createTestMemory = (
    content: string,
    sessionId?: string,
    userId?: string
  ): Memory => ({
    id: `mem-${Date.now()}`,
    content,
    metadata: {
      sessionId,
      userId,
      type: sessionId ? 'short-term' : 'long-term',
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });

  const createTestMessage = (
    content: string,
    role: 'user' | 'assistant' | 'system' = 'user'
  ): Message => ({
    id: `msg-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  beforeEach(() => {
    memorySystem = new LocalMemorySystem();
  });

  describe('constructor', () => {
    it('should create empty memory system when no initial memories provided', () => {
      const emptySystem = new LocalMemorySystem();
      const all = emptySystem.getAllMemories();
      expect(all.shortTerm).toHaveLength(0);
      expect(all.longTerm).toHaveLength(0);
    });

    it('should initialize with provided memories', () => {
      const memories: Memory[] = [
        createTestMemory('Memory 1', 'session-1'),
        createTestMemory('Memory 2', undefined, 'user-1'),
      ];
      const systemWithMemories = new LocalMemorySystem({ initialMemories: memories });
      const all = systemWithMemories.getAllMemories();
      expect(all.shortTerm.length + all.longTerm.length).toBeGreaterThan(0);
    });
  });

  describe('storeShortTerm', () => {
    it('should store string data as short-term memory', async () => {
      const sessionId = 'test-session-1';
      await memorySystem.storeShortTerm(sessionId, 'Test memory content');

      const all = memorySystem.getAllMemories();
      expect(all.shortTerm.length).toBeGreaterThan(0);
      expect(all.shortTerm[0].content).toBe('Test memory content');
      expect(all.shortTerm[0].metadata?.sessionId).toBe(sessionId);
      expect(all.shortTerm[0].metadata?.type).toBe('short-term');
    });

    it('should store object data as JSON string', async () => {
      const sessionId = 'test-session-2';
      const data = { key: 'value', number: 42 };
      await memorySystem.storeShortTerm(sessionId, data);

      const all = memorySystem.getAllMemories();
      expect(all.shortTerm.length).toBeGreaterThan(0);
      expect(all.shortTerm[0].content).toContain('key');
      expect(all.shortTerm[0].content).toContain('value');
    });

    it('should store multiple memories for same session', async () => {
      const sessionId = 'test-session-3';
      await memorySystem.storeShortTerm(sessionId, 'First memory');
      await memorySystem.storeShortTerm(sessionId, 'Second memory');

      const all = memorySystem.getAllMemories();
      const sessionMemories = all.shortTerm.filter(
        (m) => m.metadata?.sessionId === sessionId
      );
      expect(sessionMemories.length).toBe(2);
    });
  });

  describe('storeLongTerm', () => {
    it('should store string data as long-term memory', async () => {
      const userId = 'test-user-1';
      await memorySystem.storeLongTerm(userId, 'Long-term memory content');

      const all = memorySystem.getAllMemories();
      expect(all.longTerm.length).toBeGreaterThan(0);
      expect(all.longTerm[0].content).toBe('Long-term memory content');
      expect(all.longTerm[0].metadata?.userId).toBe(userId);
      expect(all.longTerm[0].metadata?.type).toBe('long-term');
    });

    it('should store object data as JSON string', async () => {
      const userId = 'test-user-2';
      const data = { learned: 'something important', date: '2024-01-01' };
      await memorySystem.storeLongTerm(userId, data);

      const all = memorySystem.getAllMemories();
      expect(all.longTerm.length).toBeGreaterThan(0);
      expect(all.longTerm[0].content).toContain('learned');
    });

    it('should store multiple memories for same user', async () => {
      const userId = 'test-user-3';
      await memorySystem.storeLongTerm(userId, 'First long-term memory');
      await memorySystem.storeLongTerm(userId, 'Second long-term memory');

      const all = memorySystem.getAllMemories();
      const userMemories = all.longTerm.filter((m) => m.metadata?.userId === userId);
      expect(userMemories.length).toBe(2);
    });
  });

  describe('searchSimilar', () => {
    beforeEach(async () => {
      await memorySystem.storeShortTerm('session-1', 'I like programming in TypeScript');
      await memorySystem.storeShortTerm('session-1', 'JavaScript is also fun');
      await memorySystem.storeLongTerm('user-1', 'Python is great for data science');
      await memorySystem.storeLongTerm('user-1', 'I enjoy building web applications');
    });

    it('should return empty array for empty query', async () => {
      const results = await memorySystem.searchSimilar('');
      expect(results).toHaveLength(0);
    });

    it('should find memories by content keyword', async () => {
      const results = await memorySystem.searchSimilar('TypeScript');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((m) => m.content.includes('TypeScript'))).toBe(true);
    });

    it('should find memories across short-term and long-term', async () => {
      const results = await memorySystem.searchSimilar('programming');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const results = await memorySystem.searchSimilar('is', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should be case-insensitive', async () => {
      const results = await memorySystem.searchSimilar('TYPESCRIPT');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-matching query', async () => {
      const results = await memorySystem.searchSimilar('nonexistentkeywordxyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('getConversationHistory', () => {
    it('should return empty array for non-existent session', async () => {
      const history = await memorySystem.getConversationHistory('non-existent');
      expect(history).toHaveLength(0);
    });

    it('should return messages for session', async () => {
      const sessionId = 'test-session-4';
      const message1 = createTestMessage('Hello', 'user');
      const message2 = createTestMessage('Hi there!', 'assistant');

      memorySystem.addMessage(sessionId, message1);
      memorySystem.addMessage(sessionId, message2);

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello');
      expect(history[1].content).toBe('Hi there!');
    });

    it('should return empty array when no messages added', async () => {
      const history = await memorySystem.getConversationHistory('empty-session');
      expect(history).toHaveLength(0);
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation history', async () => {
      const sessionId = 'test-session-5';
      const message = createTestMessage('Test message', 'user');

      memorySystem.addMessage(sessionId, message);

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Test message');
    });

    it('should append multiple messages to same session', async () => {
      const sessionId = 'test-session-6';
      const message1 = createTestMessage('First', 'user');
      const message2 = createTestMessage('Second', 'assistant');

      memorySystem.addMessage(sessionId, message1);
      memorySystem.addMessage(sessionId, message2);

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history).toHaveLength(2);
    });
  });

  describe('clearShortTerm', () => {
    it('should clear short-term memory for session', async () => {
      const sessionId = 'test-session-7';
      await memorySystem.storeShortTerm(sessionId, 'Memory to clear');

      memorySystem.clearShortTerm(sessionId);

      const all = memorySystem.getAllMemories();
      const sessionMemories = all.shortTerm.filter(
        (m) => m.metadata?.sessionId === sessionId
      );
      expect(sessionMemories).toHaveLength(0);
    });

    it('should not affect other sessions', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      await memorySystem.storeShortTerm(session1, 'Memory 1');
      await memorySystem.storeShortTerm(session2, 'Memory 2');

      memorySystem.clearShortTerm(session1);

      const all = memorySystem.getAllMemories();
      const session2Memories = all.shortTerm.filter(
        (m) => m.metadata?.sessionId === session2
      );
      expect(session2Memories.length).toBeGreaterThan(0);
    });
  });

  describe('clearLongTerm', () => {
    it('should clear long-term memory for user', async () => {
      const userId = 'test-user-4';
      await memorySystem.storeLongTerm(userId, 'Memory to clear');

      memorySystem.clearLongTerm(userId);

      const all = memorySystem.getAllMemories();
      const userMemories = all.longTerm.filter((m) => m.metadata?.userId === userId);
      expect(userMemories).toHaveLength(0);
    });

    it('should not affect other users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      await memorySystem.storeLongTerm(user1, 'Memory 1');
      await memorySystem.storeLongTerm(user2, 'Memory 2');

      memorySystem.clearLongTerm(user1);

      const all = memorySystem.getAllMemories();
      const user2Memories = all.longTerm.filter((m) => m.metadata?.userId === user2);
      expect(user2Memories.length).toBeGreaterThan(0);
    });
  });

  describe('clearConversationHistory', () => {
    it('should clear conversation history for session', async () => {
      const sessionId = 'test-session-8';
      memorySystem.addMessage(sessionId, createTestMessage('Message'));

      memorySystem.clearConversationHistory(sessionId);

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history).toHaveLength(0);
    });
  });

  describe('getAllMemories', () => {
    it('should return all short-term and long-term memories', async () => {
      await memorySystem.storeShortTerm('session-1', 'Short term 1');
      await memorySystem.storeLongTerm('user-1', 'Long term 1');

      const all = memorySystem.getAllMemories();
      expect(all.shortTerm.length).toBeGreaterThan(0);
      expect(all.longTerm.length).toBeGreaterThan(0);
    });

    it('should return empty arrays when no memories stored', () => {
      const all = memorySystem.getAllMemories();
      expect(all.shortTerm).toHaveLength(0);
      expect(all.longTerm).toHaveLength(0);
    });
  });
});

