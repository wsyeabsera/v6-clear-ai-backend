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
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'memory-system',
    ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'nomic-embed-text',
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

