/**
 * Prerequisite checking module for test runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as net from 'net';
import { resolve } from 'path';
import { ServiceCheck, PrerequisitesResult, ServiceStatus } from './types';

const execAsync = promisify(exec);

/**
 * Load environment variables
 */
function loadEnv(): {
  ollamaApiUrl: string;
  ollamaModel: string;
  mongoConnectionString: string;
  pineconeApiKey: string;
  pineconeIndexName: string;
  rabbitmqUrl: string;
  anthropicApiKey: string;
  openaiApiKey: string;
} {
  // Try to load .env.test
  try {
    const dotenv = require('dotenv');
    const paths = [
      resolve(process.cwd(), '.env.test'),
      resolve(process.cwd(), '..', '.env.test'),
      resolve(process.cwd(), '../..', 'backend', '.env.test'),
    ];
    
    for (const path of paths) {
      try {
        dotenv.config({ path });
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
    mongoConnectionString: process.env.MONGO_CONNECTION_STRING || process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017',
    pineconeApiKey: process.env.PINECONE_API_KEY || '',
    pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'context-manager',
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  };
}

/**
 * Check MongoDB connectivity
 */
async function checkMongoDB(connectionString: string): Promise<ServiceCheck> {
  try {
    // Extract host and port from connection string
    const match = connectionString.match(/mongodb:\/\/([^/]+)/);
    const hostPort = match ? match[1] : 'localhost:27017';
    const [host, port] = hostPort.split(':');

    // Try mongosh first (modern)
    try {
      const { stdout } = await execAsync(
        `mongosh "${connectionString}" --quiet --eval "db.adminCommand('ping')"`,
        { timeout: 5000 }
      );
      const versionMatch = stdout.match(/version:?\s*([0-9.]+)/i);
      return {
        name: 'MongoDB',
        status: 'available',
        required: true,
        message: 'Connected',
        version: versionMatch ? versionMatch[1] : undefined,
        details: { host, port: port || '27017' },
      };
    } catch {
      // Fallback to mongo (legacy) or net check
      const connected = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.once('error', () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(parseInt(port || '27017'), host);
      });

      if (connected) {
        return {
          name: 'MongoDB',
          status: 'available',
          required: true,
          message: 'Port reachable (version check failed)',
          details: { host, port: port || '27017' },
        };
      }
    }
  } catch (error) {
    // Ignore errors, will return unavailable below
  }

  return {
    name: 'MongoDB',
    status: 'unavailable',
    required: true,
    message: 'Not reachable. Start with: brew services start mongodb-community',
  };
}

/**
 * Check Ollama availability and models
 */
async function checkOllama(apiUrl: string, defaultModel: string): Promise<ServiceCheck> {
  try {
    const response = await axios.get(`${apiUrl}/api/tags`, { timeout: 5000 });
    
    if (response.status === 200) {
      const models = response.data?.models || [];
      const availableModels = models.map((m: any) => m.name).join(', ');
      
      // Check if default model is available
      const modelAvailable = models.some((m: any) => 
        m.name === defaultModel || m.name.startsWith(defaultModel)
      );

      return {
        name: 'Ollama',
        status: 'available',
        required: true,
        message: modelAvailable ? `Available with model: ${defaultModel}` : 'Available (model may not be installed)',
        version: availableModels || undefined,
        details: {
          models: models.map((m: any) => m.name),
          defaultModel,
          modelAvailable,
        },
      };
    }
  } catch (error: any) {
    return {
      name: 'Ollama',
      status: 'unavailable',
      required: true,
      message: `Not reachable at ${apiUrl}. Install: brew install ollama, Start: ollama serve`,
      details: { error: error.message },
    };
  }

  return {
    name: 'Ollama',
    status: 'unavailable',
    required: true,
    message: 'Not reachable',
  };
}

/**
 * Check Pinecone API key and index
 */
async function checkPinecone(apiKey: string, indexName: string): Promise<ServiceCheck> {
  if (!apiKey) {
    return {
      name: 'Pinecone',
      status: 'optional',
      required: false,
      message: 'API key not configured (optional)',
    };
  }

  try {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const pinecone = new Pinecone({ apiKey });
    
    try {
      const indexInfo = await pinecone.describeIndex(indexName);
      return {
        name: 'Pinecone',
        status: 'available',
        required: false,
        message: `Index "${indexName}" available`,
        details: {
          indexName: indexInfo.name,
          dimension: indexInfo.dimension,
          metric: indexInfo.metric,
        },
      };
    } catch (error: any) {
      return {
        name: 'Pinecone',
        status: 'unavailable',
        required: false,
        message: `Index "${indexName}" not found or inaccessible`,
        details: { error: error.message },
      };
    }
  } catch (error: any) {
    return {
      name: 'Pinecone',
      status: 'unavailable',
      required: false,
      message: 'Failed to connect to Pinecone',
      details: { error: error.message },
    };
  }
}

/**
 * Check RabbitMQ connectivity
 */
async function checkRabbitMQ(url: string): Promise<ServiceCheck> {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const port = parseInt(urlObj.port) || 5672;

    const connected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });

    if (connected) {
      // Try management UI
      try {
        const mgmtResponse = await axios.get(`http://${host}:15672`, { timeout: 2000 });
        if (mgmtResponse.status === 200) {
          return {
            name: 'RabbitMQ',
            status: 'available',
            required: false,
            message: 'Running (Management UI available)',
            details: { host, port, managementPort: 15672 },
          };
        }
      } catch {
        // Management UI not available, but AMQP port is
      }

      return {
        name: 'RabbitMQ',
        status: 'available',
        required: false,
        message: 'AMQP port reachable',
        details: { host, port },
      };
    }
  } catch (error: any) {
    // Ignore errors
  }

  return {
    name: 'RabbitMQ',
    status: 'optional',
    required: false,
    message: 'Not reachable (optional - events will be disabled)',
  };
}

/**
 * Check Claude API key
 */
function checkClaude(apiKey: string): ServiceCheck {
  if (!apiKey) {
    return {
      name: 'Claude API',
      status: 'optional',
      required: false,
      message: 'API key not configured (optional)',
    };
  }

  return {
    name: 'Claude API',
    status: 'available',
    required: false,
    message: 'API key configured',
    details: { keyPrefix: apiKey.substring(0, 8) + '...' },
  };
}

/**
 * Check OpenAI API key
 */
function checkOpenAI(apiKey: string): ServiceCheck {
  if (!apiKey) {
    return {
      name: 'OpenAI API',
      status: 'optional',
      required: false,
      message: 'API key not configured (optional)',
    };
  }

  return {
    name: 'OpenAI API',
    status: 'available',
    required: false,
    message: 'API key configured',
    details: { keyPrefix: apiKey.substring(0, 8) + '...' },
  };
}

/**
 * Check all prerequisites
 */
export async function checkPrerequisites(): Promise<PrerequisitesResult> {
  const env = loadEnv();
  const services: ServiceCheck[] = [];

  console.log('🔍 Checking prerequisites...\n');

  // Required services
  const mongoCheck = await checkMongoDB(env.mongoConnectionString);
  services.push(mongoCheck);
  console.log(`${mongoCheck.status === 'available' ? '✅' : '❌'} ${mongoCheck.name}: ${mongoCheck.message}`);

  const ollamaCheck = await checkOllama(env.ollamaApiUrl, env.ollamaModel);
  services.push(ollamaCheck);
  console.log(`${ollamaCheck.status === 'available' ? '✅' : '❌'} ${ollamaCheck.name}: ${ollamaCheck.message}`);

  // Optional services
  const pineconeCheck = await checkPinecone(env.pineconeApiKey, env.pineconeIndexName);
  services.push(pineconeCheck);
  console.log(`${pineconeCheck.status === 'available' ? '✅' : pineconeCheck.status === 'optional' ? '⚠️ ' : '❌'} ${pineconeCheck.name}: ${pineconeCheck.message}`);

  const rabbitmqCheck = await checkRabbitMQ(env.rabbitmqUrl);
  services.push(rabbitmqCheck);
  console.log(`${rabbitmqCheck.status === 'available' ? '✅' : '⚠️ '} ${rabbitmqCheck.name}: ${rabbitmqCheck.message}`);

  const claudeCheck = checkClaude(env.anthropicApiKey);
  services.push(claudeCheck);
  console.log(`${claudeCheck.status === 'available' ? '✅' : '⚠️ '} ${claudeCheck.name}: ${claudeCheck.message}`);

  const openaiCheck = checkOpenAI(env.openaiApiKey);
  services.push(openaiCheck);
  console.log(`${openaiCheck.status === 'available' ? '✅' : '⚠️ '} ${openaiCheck.name}: ${openaiCheck.message}`);

  const allRequiredAvailable = services
    .filter((s) => s.required)
    .every((s) => s.status === 'available');

  console.log('');

  return {
    services,
    allRequiredAvailable,
    timestamp: new Date().toISOString(),
  };
}

