import {
  IMemorySystem,
  Memory,
  Message,
  LocalMemoryConfig,
} from '../types';

export class LocalMemorySystem implements IMemorySystem {
  private shortTermMemory: Map<string, Memory[]>; // sessionId -> memories
  private longTermMemory: Map<string, Memory[]>; // userId -> memories
  private conversationHistory: Map<string, Message[]>; // sessionId -> messages

  constructor(config?: LocalMemoryConfig) {
    this.shortTermMemory = new Map<string, Memory[]>();
    this.longTermMemory = new Map<string, Memory[]>();
    this.conversationHistory = new Map<string, Message[]>();

    // Initialize with provided memories if any
    if (config?.initialMemories) {
      for (const memory of config.initialMemories) {
        if (memory.metadata?.sessionId) {
          this.addToMap(this.shortTermMemory, memory.metadata.sessionId, memory);
        }
        if (memory.metadata?.userId) {
          this.addToMap(this.longTermMemory, memory.metadata.userId, memory);
        }
      }
    }
  }

  async storeShortTerm(sessionId: string, data: any): Promise<void> {
    const memory: Memory = {
      id: this.generateId(),
      content: typeof data === 'string' ? data : JSON.stringify(data),
      metadata: {
        sessionId,
        type: 'short-term',
        timestamp: new Date().toISOString(),
        ...(typeof data === 'object' && data !== null ? { originalData: data } : {}),
      },
      timestamp: new Date().toISOString(),
    };

    this.addToMap(this.shortTermMemory, sessionId, memory);
  }

  async storeLongTerm(userId: string, data: any): Promise<void> {
    const memory: Memory = {
      id: this.generateId(),
      content: typeof data === 'string' ? data : JSON.stringify(data),
      metadata: {
        userId,
        type: 'long-term',
        timestamp: new Date().toISOString(),
        ...(typeof data === 'object' && data !== null ? { originalData: data } : {}),
      },
      timestamp: new Date().toISOString(),
    };

    this.addToMap(this.longTermMemory, userId, memory);
  }

  async searchSimilar(query: string, limit?: number): Promise<Memory[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase().trim();
    const matchingMemories: Memory[] = [];

    // Search in both short-term and long-term memory
    const allMemories: Memory[] = [];
    for (const memories of this.shortTermMemory.values()) {
      allMemories.push(...memories);
    }
    for (const memories of this.longTermMemory.values()) {
      allMemories.push(...memories);
    }

    // Simple keyword matching (no embeddings for local)
    for (const memory of allMemories) {
      const contentMatch = memory.content.toLowerCase().includes(queryLower);
      const metadataMatch = JSON.stringify(memory.metadata || {})
        .toLowerCase()
        .includes(queryLower);

      if (contentMatch || metadataMatch) {
        matchingMemories.push(memory);
      }

      if (limit && matchingMemories.length >= limit) {
        break;
      }
    }

    return matchingMemories;
  }

  async getConversationHistory(sessionId: string): Promise<Message[]> {
    return this.conversationHistory.get(sessionId) || [];
  }

  /**
   * Add a message to conversation history
   */
  addMessage(sessionId: string, message: Message): void {
    const history = this.conversationHistory.get(sessionId) || [];
    history.push(message);
    this.conversationHistory.set(sessionId, history);
  }

  /**
   * Clear short-term memory for a session
   */
  clearShortTerm(sessionId: string): void {
    this.shortTermMemory.delete(sessionId);
  }

  /**
   * Clear long-term memory for a user
   */
  clearLongTerm(userId: string): void {
    this.longTermMemory.delete(userId);
  }

  /**
   * Clear conversation history for a session
   */
  clearConversationHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }

  /**
   * Get all memories (for testing/debugging)
   */
  getAllMemories(): { shortTerm: Memory[]; longTerm: Memory[] } {
    const shortTerm: Memory[] = [];
    const longTerm: Memory[] = [];

    for (const memories of this.shortTermMemory.values()) {
      shortTerm.push(...memories);
    }
    for (const memories of this.longTermMemory.values()) {
      longTerm.push(...memories);
    }

    return { shortTerm, longTerm };
  }

  /**
   * Helper to add memory to a map
   */
  private addToMap(map: Map<string, Memory[]>, key: string, memory: Memory): void {
    const existing = map.get(key) || [];
    existing.push(memory);
    map.set(key, existing);
  }

  /**
   * Generate a unique ID for memories
   */
  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

