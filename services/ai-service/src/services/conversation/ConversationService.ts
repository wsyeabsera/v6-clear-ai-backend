import { v4 as uuidv4 } from 'uuid';
import { ConversationContext, Message } from 'shared';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { AgentConfig } from '../../types';
import { getCurrentTimestamp } from 'shared';

export class ConversationService {
  constructor(
    private db: Database,
    private kernelAdapter: KernelAdapter
  ) {}

  async getOrCreateSession(userId: string, sessionId?: string): Promise<string> {
    if (sessionId) {
      // Verify session exists and belongs to user
      const collection = this.db.getCollection();
      const session = await collection.findOne({ sessionId, userId });
      if (session) {
        return sessionId;
      }
      // If session doesn't exist, create new one with provided ID
      await this.createSession(userId, sessionId);
      return sessionId;
    }

    // Auto-generate new session
    const newSessionId = uuidv4();
    await this.createSession(userId, newSessionId);
    return newSessionId;
  }

  private async createSession(userId: string, sessionId: string): Promise<void> {
    const collection = this.db.getCollection();
    const now = getCurrentTimestamp();
    
    await collection.insertOne({
      sessionId,
      userId,
      messages: [],
      createdAt: now,
    });
  }

  async getConversationHistory(sessionId: string, userId?: string): Promise<Message[]> {
    const collection = this.db.getCollection();
    const query: any = { sessionId };
    if (userId) {
      query.userId = userId; // Ensure user owns the conversation
    }
    
    const conversation = await collection.findOne(query);
    
    if (!conversation) {
      return [];
    }

    return conversation.messages || [];
  }

  async addMessage(sessionId: string, message: Message, userId?: string): Promise<void> {
    const collection = this.db.getCollection();
    const now = getCurrentTimestamp();

    // Add message to MongoDB with upsert to handle missing conversations
    const updateResult = await collection.updateOne(
      { sessionId },
      {
        $push: { messages: message },
        $set: { 
          updatedAt: now,
          ...(userId && { userId }), // Set userId if provided and not already set
        },
      },
      { upsert: true }
    );

    // If document was created, set createdAt
    if (updateResult.upsertedCount > 0) {
      await collection.updateOne(
        { sessionId },
        { $set: { createdAt: now } }
      );
    }

    // Also add to Context Manager
    try {
      const context = await this.kernelAdapter.contextManager.getContext(sessionId);
      if (context) {
        const updatedContext: ConversationContext = {
          ...context,
          messages: [...context.messages, message],
          metadata: {
            ...context.metadata,
            updatedAt: now,
          },
        };
        await this.kernelAdapter.contextManager.saveContext(sessionId, updatedContext);
      } else {
        // Create new context if it doesn't exist
        const newContext: ConversationContext = {
          sessionId,
          messages: [message],
          metadata: {
            createdAt: now,
            updatedAt: now,
          },
        };
        await this.kernelAdapter.contextManager.saveContext(sessionId, newContext);
      }
    } catch (error) {
      console.warn('⚠️  Failed to update context manager (non-critical):', error);
      // Continue even if context manager fails - MongoDB is the source of truth
    }
  }

  async getUserPreferences(_userId: string): Promise<any> {
    // Placeholder for future User Service integration
    // For now, return empty object
    return {};
  }

  async getAgentConfig(userId: string, configId?: string): Promise<AgentConfig | null> {
    // If no configId provided, return default config
    if (!configId) {
      return {
        id: 'default',
        userId,
        name: 'Default Config',
        prompt: 'You are a helpful AI assistant.',
        model: process.env.DEFAULT_LLM_PROVIDER === 'claude' ? 'claude-3-sonnet-20240229' :
               process.env.DEFAULT_LLM_PROVIDER === 'openai' ? 'gpt-4-turbo-preview' :
               'llama2',
        temperature: 0.7,
        maxTokens: 1024,
        createdAt: getCurrentTimestamp(),
      };
    }

    // Query Agent Configs Service MongoDB directly
    // In production, this would query via GraphQL federation, but for now we query directly
    try {
      const { MongoClient } = await import('mongodb');
      const agentConfigsMongoUri = process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI || 
        'mongodb://localhost:27017/agent_configs_service';
      const client = new MongoClient(agentConfigsMongoUri, {
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2'),
        maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000'),
        serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000'),
        socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000'),
        connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000'),
      });
      
      try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('agent_configs');
        
        const config = await collection.findOne({ id: configId, userId });
        return config ? {
          id: config.id,
          userId: config.userId,
          name: config.name,
          prompt: config.prompt,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        } : null;
      } finally {
        await client.close();
      }
    } catch (error) {
      console.warn('Failed to fetch agent config from MongoDB:', error);
      return null;
    }
  }

  async getConversationContext(sessionId: string, userId?: string): Promise<ConversationContext | null> {
    try {
      const context = await this.kernelAdapter.contextManager.getContext(sessionId);
      if (context) {
        return context;
      }
    } catch (error) {
      console.warn('⚠️  Failed to get context from context manager (falling back to MongoDB):', error);
    }
    
    // Fallback to MongoDB
    const messages = await this.getConversationHistory(sessionId, userId);
    if (messages.length === 0) {
      return null;
    }
    
    const collection = this.db.getCollection();
    const conversation = await collection.findOne({ 
      sessionId,
      ...(userId && { userId })
    });
    
    if (!conversation) {
      return null;
    }
    
    return {
      sessionId,
      messages,
      metadata: {
        createdAt: conversation.createdAt || getCurrentTimestamp(),
        updatedAt: conversation.updatedAt,
      },
    };
  }

  async getAllConversations(userId: string): Promise<Array<{
    sessionId: string;
    messages: Message[];
    createdAt: string;
    updatedAt?: string;
  }>> {
    const collection = this.db.getCollection();
    
    // Find all conversations for this user
    const conversations = await collection
      .find({ userId })
      .sort({ updatedAt: -1, createdAt: -1 }) // Most recent first
      .toArray();
    
    // Transform to match Conversation type
    return conversations.map((conv) => ({
      sessionId: conv.sessionId,
      messages: conv.messages || [],
      createdAt: conv.createdAt || getCurrentTimestamp(),
      updatedAt: conv.updatedAt,
    }));
  }
}

