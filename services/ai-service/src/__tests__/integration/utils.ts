import axios from 'axios';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentTimestamp } from 'shared';

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Load environment variables for integration tests
 */
export function loadTestEnv(): {
  ollamaApiUrl: string;
  ollamaModel: string;
  mongoConnectionString: string;
  agentConfigsMongoUri: string;
  aiServiceMongoUri: string;
  jwtSecret: string;
  pineconeApiKey: string;
  pineconeIndexName: string;
} {
  // Try to load .env.test
  try {
    const { resolve } = require('path');
    const paths = [
      resolve(process.cwd(), '.env.test'),
      resolve(process.cwd(), '..', '.env.test'),
      resolve(process.cwd(), '../..', 'backend', '.env.test'),
    ];
    
    for (const path of paths) {
      try {
        require('dotenv').config({ path });
        break;
      } catch {
        // Continue to next path
      }
    }
  } catch (error) {
    // dotenv may not be available
  }

  return {
    ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama2',
    mongoConnectionString: process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017',
    agentConfigsMongoUri: process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/agent_configs_service',
    aiServiceMongoUri: process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service',
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'context-manager',
  };
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailability(): Promise<boolean> {
  const env = loadTestEnv();
  try {
    const response = await axios.get(`${env.ollamaApiUrl}/api/tags`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a specific Ollama model is available
 */
export async function checkOllamaModel(model: string): Promise<boolean> {
  const env = loadTestEnv();
  try {
    const response = await axios.get(`${env.ollamaApiUrl}/api/tags`, { timeout: 5000 });
    const models = response.data.models || [];
    return models.some((m: any) => m.name === model || m.name.startsWith(model));
  } catch (error) {
    return false;
  }
}

/**
 * Create a test agent config directly in MongoDB
 */
export async function createTestAgentConfig(
  userId: string,
  config: Partial<AgentConfig> = {}
): Promise<AgentConfig> {
  const env = loadTestEnv();
  const client = new MongoClient(env.agentConfigsMongoUri);
  
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection<AgentConfig>('agent_configs');

    const agentConfig: AgentConfig = {
      id: config.id || uuidv4(),
      userId: config.userId || userId,
      name: config.name || 'Test Ollama Config',
      prompt: config.prompt || 'You are a helpful AI assistant.',
      model: config.model || 'llama2',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens || 1024,
      createdAt: config.createdAt || getCurrentTimestamp(),
      ...(config.updatedAt && { updatedAt: config.updatedAt }),
    };

    await collection.insertOne(agentConfig as any);
    return agentConfig;
  } finally {
    await client.close();
  }
}

/**
 * Delete a test agent config from MongoDB
 */
export async function deleteTestAgentConfig(configId: string): Promise<void> {
  const env = loadTestEnv();
  const client = new MongoClient(env.agentConfigsMongoUri);
  
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('agent_configs');
    await collection.deleteOne({ id: configId });
  } finally {
    await client.close();
  }
}

/**
 * Clean up all test agent configs for a user
 */
export async function cleanupTestAgentConfigs(userId: string): Promise<void> {
  const env = loadTestEnv();
  const client = new MongoClient(env.agentConfigsMongoUri);
  
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('agent_configs');
    await collection.deleteMany({ userId });
  } finally {
    await client.close();
  }
}

/**
 * Clean up test conversations from AI Service MongoDB
 */
export async function cleanupTestConversations(sessionIds: string[]): Promise<void> {
  if (!sessionIds || sessionIds.length === 0) return;

  const env = loadTestEnv();
  const client = new MongoClient(env.aiServiceMongoUri);
  
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('conversations');
    await collection.deleteMany({ sessionId: { $in: sessionIds } });
  } catch (error) {
    // Silently fail cleanup
    if (process.env.VERBOSE) {
      console.warn('Failed to cleanup test conversations:', error);
    }
  } finally {
    await client.close();
  }
}

/**
 * Generate a test user ID
 */
export function generateTestUserId(): string {
  return `test-user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a test session ID
 */
export function generateTestSessionId(): string {
  return `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a JWT token for testing
 */
export function createTestJWT(userId: string, email: string = 'test@example.com'): string {
  const jwt = require('jsonwebtoken');
  const env = loadTestEnv();
  return jwt.sign({ userId, email }, env.jwtSecret, { expiresIn: '1h' });
}

