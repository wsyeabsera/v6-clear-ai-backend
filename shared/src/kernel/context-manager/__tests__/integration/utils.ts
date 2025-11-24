import { Message, ConversationContext } from '../../types';
import { LocalFileContextManager } from '../../implementations/LocalFileContextManager';
import { MongoContextManager } from '../../implementations/MongoContextManager';
import { PineconeContextManager } from '../../implementations/PineconeContextManager';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { MongoClient } from 'mongodb';
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * Generate a unique session ID for tests
 */
export function generateSessionId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a test message
 */
export function createTestMessage(
  content: string,
  role: 'user' | 'assistant' | 'system' = 'user',
  id?: string
): Message {
  return {
    id: id || generateSessionId('msg'),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a test conversation context
 */
export function createTestContext(
  sessionId: string,
  messages: Message[] = [],
  metadata?: ConversationContext['metadata']
): ConversationContext {
  return {
    sessionId,
    messages,
    metadata: {
      createdAt: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Generate multiple test messages
 */
export function createTestMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    createTestMessage(`Test message ${i + 1}`, i % 2 === 0 ? 'user' : 'assistant')
  );
}

// Cleanup helpers for each implementation

/**
 * Cleanup LocalFileContextManager test files
 */
export async function cleanupLocalFile(
  _manager: LocalFileContextManager,
  sessionIds: string[],
  basePath: string
): Promise<void> {
  for (const sessionId of sessionIds) {
    const filePath = join(basePath, `${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    if (existsSync(filePath)) {
      try {
        const fs = await import('fs');
        await fs.promises.unlink(filePath);
      } catch (error) {
        console.warn(`Failed to delete test file ${filePath}:`, error);
      }
    }
  }

  // Clean up empty directory if it exists and is test directory
  if (existsSync(basePath) && basePath.includes('test')) {
    try {
      const files = readdirSync(basePath);
      if (files.length === 0) {
        rmSync(basePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Cleanup MongoContextManager test documents
 */
export async function cleanupMongo(
  _manager: MongoContextManager,
  sessionIds: string[],
  config: { connectionString: string; databaseName: string; collectionName?: string }
): Promise<void> {
  if (!sessionIds || sessionIds.length === 0) return;

  try {
    const client = new MongoClient(config.connectionString);
    await client.connect();
    const db = client.db(config.databaseName);
    const collection = db.collection(config.collectionName || 'contexts');

    // Delete all test documents
    await collection.deleteMany({
      sessionId: { $in: sessionIds },
    });

    await client.close();
  } catch (error) {
    // Silently fail cleanup - test data may not exist
    if (process.env.VERBOSE) {
      console.warn('Failed to cleanup MongoDB test data:', error);
    }
  }
}

/**
 * Cleanup PineconeContextManager test vectors
 */
export async function cleanupPinecone(
  _manager: PineconeContextManager,
  sessionIds: string[],
  config: { apiKey: string; indexName: string; environment?: string }
): Promise<void> {
  if (!sessionIds || sessionIds.length === 0) return;

  try {
    const clientConfig: { apiKey: string; environment?: string } = {
      apiKey: config.apiKey,
    };
    if (config.environment) {
      clientConfig.environment = config.environment;
    }
    // Type assertion needed because Pinecone types require environment, but it's optional
    const client = new Pinecone(clientConfig as any);
    const index = client.Index(config.indexName);

    // Delete vectors by IDs - Pinecone delete accepts array of IDs
    // Note: Pinecone deleteMany may not exist, use delete with ids parameter
    if (sessionIds.length > 0) {
      try {
        // Try delete method with ids parameter (most common Pinecone API)
        await (index as any).delete({ ids: sessionIds });
      } catch {
        // Silently fail cleanup - vectors may not exist or delete may not be available
        // This is okay for integration tests cleanup
      }
    }
  } catch (error: any) {
    // Silently fail cleanup - test data may not exist or may have been cleaned up
    // Only warn in verbose mode or if it's not a "not found" error
    if (process.env.VERBOSE || (error?.message && !error.message.includes('not found'))) {
      console.warn('Failed to cleanup Pinecone test vectors:', error?.message || error);
    }
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Load environment variables for integration tests
 */
export function loadTestEnv(): {
  mongoConnectionString: string;
  mongoDatabaseName: string;
  pineconeApiKey: string;
  pineconeIndexName: string;
  ollamaApiUrl: string;
  ollamaModel: string;
} {
  // Load .env.test if dotenv is available
  // Try multiple locations: current dir, parent dir, or backend root
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
        break; // Successfully loaded, stop trying
      } catch {
        // Continue to next path
      }
    }
  } catch (error) {
    // dotenv may not be available or .env.test may not exist
  }

  return {
    mongoConnectionString:
      process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost:27017',
    mongoDatabaseName: process.env.MONGO_DATABASE_NAME || 'context-manager-test',
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'context-manager',
    ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'nomic-embed-text',
  };
}

/**
 * Check if a service is available
 */
export async function checkServiceAvailability(
  service: 'mongo' | 'pinecone' | 'ollama',
  config?: any
): Promise<boolean> {
  const env = loadTestEnv();

  try {
    switch (service) {
      case 'mongo':
        const mongoClient = new MongoClient(
          config?.connectionString || env.mongoConnectionString
        );
        await mongoClient.connect();
        await mongoClient.close();
        return true;

      case 'pinecone':
        const pineconeApiKey = config?.apiKey || env.pineconeApiKey;
        if (!pineconeApiKey) return false;
        
        // For serverless Pinecone, the SDK's availability check may fail
        // because it tries to use controller endpoints that don't exist for serverless.
        // If we have an API key, assume it's available and let the actual tests verify.
        // Serverless API keys start with 'pcsk_'
        if (pineconeApiKey.startsWith('pcsk_')) {
          // Serverless - skip availability check, let tests verify connectivity
          return true;
        }
        
        // For all Pinecone (including serverless), try the standard availability check
        try {
          const pinecone = new Pinecone({ 
            apiKey: pineconeApiKey
          });
          
          const index = pinecone.Index(env.pineconeIndexName);
          
          // Try a simple query to verify the index is accessible
          await index.query({
            vector: new Array(768).fill(0),
            topK: 1,
            includeMetadata: false
          });
          
          return true;
        } catch (error: any) {
          console.warn('Pinecone connection failed:', error?.message || error);
          return false;
        }

      case 'ollama':
        const axios = require('axios');
        await axios.get(`${env.ollamaApiUrl}/api/tags`, { timeout: 5000 });
        return true;

      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Tag session ID as test data (for filtering in cleanup)
 */
export function tagTestSessionId(sessionId: string): string {
  return `test-${sessionId}`;
}

/**
 * Check if a session ID is a test session
 */
export function isTestSessionId(sessionId: string): boolean {
  return sessionId.startsWith('test-');
}

