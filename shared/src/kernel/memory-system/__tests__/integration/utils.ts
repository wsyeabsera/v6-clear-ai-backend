import { Memory, Message } from '../../types';
import { PineconeMemorySystem } from '../../implementations/PineconeMemorySystem';
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * Generate a unique session ID for tests
 */
export function generateSessionId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique user ID for tests
 */
export function generateUserId(prefix = 'test-user'): string {
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
 * Load environment variables for integration tests
 */
export function loadTestEnv(): {
  pineconeApiKey: string;
  pineconeIndexName: string;
  ollamaApiUrl: string;
  ollamaModel: string;
} {
  // Load .env.test if dotenv is available
  try {
    require('dotenv').config({ path: '.env.test' });
  } catch (error) {
    // dotenv may not be available or .env.test may not exist
  }

  return {
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'memory-system',
    ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'nomic-text',
  };
}

/**
 * Check if a service is available
 */
export async function checkServiceAvailability(
  service: 'pinecone' | 'ollama',
  config?: any
): Promise<boolean> {
  const env = loadTestEnv();

  try {
    switch (service) {
      case 'pinecone':
        const pineconeApiKey = config?.apiKey || env.pineconeApiKey;
        if (!pineconeApiKey) return false;

        try {
          const clientConfig: { apiKey: string; environment?: string } = {
            apiKey: pineconeApiKey,
          };
          // Type assertion needed because Pinecone types require environment, but it's optional
          const pinecone = new Pinecone(clientConfig as any);
          await pinecone.describeIndex(env.pineconeIndexName);
          return true;
        } catch {
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
 * Cleanup PineconeMemorySystem test vectors
 */
export async function cleanupPineconeMemory(
  _system: PineconeMemorySystem,
  memoryIds: string[],
  config: { apiKey: string; indexName: string; environment?: string }
): Promise<void> {
  if (!memoryIds || memoryIds.length === 0) return;

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

    // Delete vectors by IDs
    if (memoryIds.length > 0) {
      try {
        // Try delete method with ids parameter (most common Pinecone API)
        await (index as any).delete({ ids: memoryIds });
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

