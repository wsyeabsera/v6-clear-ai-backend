import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import * as dotenv from 'dotenv';
import express from 'express';
import { typeDefs } from './schema/typeDefs';
import { createResolvers } from './schema/resolvers';
import { Database } from './database';
import { KernelAdapter } from './kernel/KernelAdapter';
import { ConversationService } from './services/conversation/ConversationService';
import { AskModeHandler } from './handlers/AskModeHandler';
import { PlanModeHandler } from './handlers/PlanModeHandler';
import { AgentModeHandler } from './handlers/AgentModeHandler';
import { AuthService } from './auth';

// Load .env if it exists (for local development)
dotenv.config();

async function startServer() {
  // Railway provides PORT, fallback to AI_SERVICE_PORT for local dev
  const PORT = parseInt(process.env.PORT || process.env.AI_SERVICE_PORT || '4005');

  // Initialize database
  const db = new Database();
  await db.connect();

  // Initialize Auth Service (reuse from agent-configs-service pattern)
  const authService = new AuthService();

  // Initialize Kernel Adapter
  const kernelAdapter = new KernelAdapter();

  // Initialize Conversation Service
  const conversationService = new ConversationService(db, kernelAdapter);

  // Initialize Ask Mode Handler
  const askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

  // Initialize Plan Mode Handler
  const planModeHandler = new PlanModeHandler(conversationService, kernelAdapter);

  // Initialize Agent Mode Handler
  const agentModeHandler = new AgentModeHandler(conversationService, kernelAdapter);

  // Create Apollo Server with Federation
  const resolvers = createResolvers(db, kernelAdapter, conversationService, askModeHandler, planModeHandler, agentModeHandler);
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  });

  await server.start();

  // Create Express app
  const app = express();

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'ai-service',
      dependencies: {
        database: db ? 'connected' : 'disconnected',
        rabbitMQ: kernelAdapter.eventBus ? 'available' : 'unavailable',
      },
    };

    // Check database connection
    try {
      const collection = db.getCollection();
      await collection.findOne({}, { limit: 1 });
      health.dependencies.database = 'connected';
    } catch (error) {
      health.status = 'unhealthy';
      health.dependencies.database = 'disconnected';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // GraphQL endpoint
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Extract and verify token
        const authHeader = req.headers.authorization;
        const token = authService.extractTokenFromHeader(authHeader);
        
        let userId: string | undefined;
        if (token) {
          try {
            const payload = authService.verifyToken(token);
            userId = payload.userId;
          } catch (error) {
            // Invalid token - userId remains undefined
            console.log('⚠️  Invalid token provided');
          }
        }

        return {
          db,
          kernelAdapter,
          conversationService,
          askModeHandler,
          planModeHandler,
          agentModeHandler,
          userId,
        };
      },
    })
  );

  // Start Express server
  app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    console.log(`🚀 AI Service ready at ${baseUrl}`);
    console.log(`📊 GraphQL endpoint: ${baseUrl}/graphql`);
    console.log(`🏥 Health check endpoint: ${baseUrl}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await db.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await db.disconnect();
    process.exit(0);
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start AI Service:', error);
  process.exit(1);
});

