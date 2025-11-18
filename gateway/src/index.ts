import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Custom data source to forward headers
class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }: any) {
    // Forward the authorization header from the gateway context to the subgraph
    if (context.headers?.authorization) {
      request.http.headers.set('authorization', context.headers.authorization);
    }
  }
}

// Helper function to check if a service is ready
async function waitForService(url: string, maxRetries = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

async function startGateway() {
  const PORT = parseInt(process.env.GATEWAY_PORT || '4000');

  // Wait for services to be ready before starting gateway
  console.log('⏳ Waiting for subgraph services to be ready...');
  
  const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql';
  const agentConfigsServiceUrl = process.env.AGENT_CONFIGS_SERVICE_URL || 'http://localhost:4003/graphql';
  
  const [userServiceReady, agentConfigsReady] = await Promise.all([
    waitForService(userServiceUrl),
    waitForService(agentConfigsServiceUrl),
  ]);

  if (!userServiceReady) {
    console.error(`❌ User Service at ${userServiceUrl} is not responding`);
    throw new Error('User Service not available');
  }
  if (!agentConfigsReady) {
    console.error(`❌ Agent Configs Service at ${agentConfigsServiceUrl} is not responding`);
    throw new Error('Agent Configs Service not available');
  }

  console.log('✅ All subgraph services are ready!');

  // Configure subgraph services
  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        {
          name: 'user-service',
          url: userServiceUrl,
        },
        {
          name: 'agent-configs-service',
          url: agentConfigsServiceUrl,
        },
      ],
      // Poll for schema updates every 10 seconds in development
      pollIntervalInMs: process.env.NODE_ENV === 'production' ? undefined : 10000,
    }),
    buildService({ url }) {
      return new AuthenticatedDataSource({ url });
    },
  });

  // Create Apollo Server with Gateway
  const server = new ApolloServer({
    gateway,
    // Disable subscriptions (not supported by gateway yet)
    // Enable introspection and playground in development
    introspection: process.env.NODE_ENV !== 'production',
  });

  // Start server
  const { url } = await startStandaloneServer(server, {
    listen: { port: PORT },
    context: async ({ req }) => {
      // Forward authorization header to subgraphs
      return {
        headers: {
          authorization: req.headers.authorization || '',
        },
      };
    },
  });

  console.log('🚀 Apollo Gateway ready!');
  console.log(`📊 GraphQL endpoint: ${url}`);
  console.log(`🔍 GraphQL Playground: ${url}`);
  console.log('\n📡 Federated Services:');
  console.log(`  - User Service: ${process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql'}`);
  console.log(`  - Agent Configs Service: ${process.env.AGENT_CONFIGS_SERVICE_URL || 'http://localhost:4003/graphql'}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

startGateway().catch((error) => {
  console.error('❌ Failed to start Apollo Gateway:', error);
  process.exit(1);
});

