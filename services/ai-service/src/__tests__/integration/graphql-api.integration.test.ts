import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import axios from 'axios';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import { createResolvers } from '../../schema/resolvers';
import { typeDefs } from '../../schema/typeDefs';
import { AuthService } from '../../auth';
import {
  loadTestEnv,
  checkOllamaAvailability,
  checkOllamaModel,
  createTestAgentConfig,
  deleteTestAgentConfig,
  cleanupTestAgentConfigs,
  cleanupTestConversations,
  generateTestUserId,
  createTestJWT,
} from './utils';

describe('AI Service GraphQL API Integration Tests', () => {
  let server: ApolloServer;
  let serverUrl: string;
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testToken: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';

  beforeAll(async () => {
    // Check Ollama availability
    ollamaAvailable = await checkOllamaAvailability();
    
    if (!ollamaAvailable) {
      console.warn('⚠️  Ollama not available, skipping GraphQL API tests');
      return;
    }

    const env = loadTestEnv();
    ollamaModel = env.ollamaModel;
    
    const modelAvailable = await checkOllamaModel(ollamaModel);
    if (!modelAvailable) {
      ollamaModel = 'llama2';
    }

    // Set environment variables for tests (use MongoDB instead of Pinecone)
    process.env.CONTEXT_MANAGER_TYPE = 'mongo';
    process.env.MEMORY_SYSTEM_TYPE = 'local';
    process.env.AI_SERVICE_MONGODB_URI = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service_test';

    // Initialize services
    db = new Database();
    await db.connect();

    kernelAdapter = new KernelAdapter();
    conversationService = new ConversationService(db, kernelAdapter);
    askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

    // Create Apollo Server
    const resolvers = createResolvers(db, kernelAdapter, conversationService, askModeHandler);
    server = new ApolloServer({
      schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
    });

    // Start server
    const { url } = await startStandaloneServer(server, {
      listen: { port: 0 }, // Random port
      context: async ({ req }) => {
        const authService = new AuthService();
        const authHeader = req.headers.authorization;
        const token = authService.extractTokenFromHeader(authHeader);
        
        let userId: string | undefined;
        if (token) {
          try {
            const payload = authService.verifyToken(token);
            userId = payload.userId;
          } catch (error) {
            // Invalid token
          }
        }

        return {
          db,
          kernelAdapter,
          conversationService,
          askModeHandler,
          userId,
        };
      },
    });

    serverUrl = url;
    console.log(`✅ Test GraphQL server started at ${serverUrl}`);
  }, 60000);

  beforeEach(async () => {
    if (!ollamaAvailable) return;

    testUserId = generateTestUserId();
    testToken = createTestJWT(testUserId);
    testSessionIds = [];
    testConfigIds = [];
  });

  afterEach(async () => {
    if (!ollamaAvailable) return;

    // Cleanup
    if (testSessionIds.length > 0) {
      await cleanupTestConversations(testSessionIds);
    }
    
    if (testConfigIds.length > 0) {
      for (const configId of testConfigIds) {
        await deleteTestAgentConfig(configId);
      }
    }

    if (testUserId) {
      await cleanupTestAgentConfigs(testUserId);
    }
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (db) {
      await db.disconnect();
    }
  });

  const ASK_MUTATION = `
    mutation Ask($query: String!, $sessionId: ID, $configId: ID) {
      ask(query: $query, sessionId: $sessionId, configId: $configId) {
        id
        sessionId
        response
        tokensUsed
        model
        timestamp
      }
    }
  `;

  const CONVERSATION_QUERY = `
    query Conversation($sessionId: ID!) {
      conversation(sessionId: $sessionId) {
        sessionId
        messages {
          id
          role
          content
          timestamp
        }
        createdAt
        updatedAt
      }
    }
  `;

  describe('ask Mutation', () => {
    it('should process ask query via GraphQL API with Ollama', async () => {
      if (!ollamaAvailable) return;

      // Create Ollama agent config
      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Ollama GraphQL Test',
        model: ollamaModel,
        prompt: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      // Execute GraphQL mutation
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: ASK_MUTATION,
          variables: {
            query: 'Say hello in one sentence.',
            configId: agentConfig.id,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data).toBeDefined();
      expect(response.data.data.ask).toBeDefined();
      
      const askResponse = response.data.data.ask;
      expect(askResponse.id).toBeDefined();
      expect(askResponse.sessionId).toBeDefined();
      expect(askResponse.response).toBeTruthy();
      expect(askResponse.model).toBe(ollamaModel);
      expect(askResponse.timestamp).toBeDefined();

      testSessionIds.push(askResponse.sessionId);
    }, 60000);

    it('should require authentication', async () => {
      if (!ollamaAvailable) return;

      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: ASK_MUTATION,
          variables: {
            query: 'Hello',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            // No Authorization header
          },
          validateStatus: () => true, // Don't throw on error status
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.errors).toBeDefined();
      expect(response.data.errors[0].message).toContain('Authentication required');
    });

    it('should auto-generate sessionId when not provided', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: ASK_MUTATION,
          variables: {
            query: 'Hello',
            configId: agentConfig.id,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.ask.sessionId).toBeDefined();
      testSessionIds.push(response.data.data.ask.sessionId);
    }, 60000);
  });

  describe('conversation Query', () => {
    it('should retrieve conversation history via GraphQL', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // First, create a conversation by asking a question
      const askResponse = await axios.post(
        `${serverUrl}graphql`,
        {
          query: ASK_MUTATION,
          variables: {
            query: 'My name is Bob.',
            configId: agentConfig.id,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      const sessionId = askResponse.data.data.ask.sessionId;
      testSessionIds.push(sessionId);

      // Wait a bit for the conversation to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Query conversation
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: CONVERSATION_QUERY,
          variables: {
            sessionId,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.conversation).toBeDefined();
      expect(response.data.data.conversation.messages.length).toBeGreaterThanOrEqual(2);
      expect(response.data.data.conversation.messages[0].role).toBe('user');
      expect(response.data.data.conversation.messages[0].content).toBe('My name is Bob.');
    }, 90000);
  });
});

