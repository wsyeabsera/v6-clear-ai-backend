import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import * as dotenv from 'dotenv';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { Database } from './database';
import { AuthService } from './auth';

// Load .env if it exists (for local development)
// Railway uses environment variables directly, so this is optional
dotenv.config();

async function startServer() {
  // Railway provides PORT, fallback to AGENT_CONFIGS_SERVICE_PORT for local dev
  const PORT = parseInt(process.env.PORT || process.env.AGENT_CONFIGS_SERVICE_PORT || '4003');

  // Initialize database
  const db = new Database();
  await db.connect();

  // Initialize Auth Service
  const authService = new AuthService();

  // Create Apollo Server with Federation
  const resolvers = createResolvers(db);
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  });

  // Start server
  const { url } = await startStandaloneServer(server, {
    listen: { port: PORT },
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

      return { db, authService, userId };
    },
  });

  console.log(`🚀 Agent Configs Service ready at ${url}`);
  console.log(`📊 GraphQL endpoint: ${url}graphql`);

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
  console.error('❌ Failed to start Agent Configs Service:', error);
  process.exit(1);
});

