# Microservices Backend with Apollo Federation

A scalable microservices architecture using TypeScript, Apollo Federation, GraphQL, RabbitMQ, and MongoDB.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│                    http://localhost:3000                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ GraphQL Queries
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Apollo Gateway                            │
│                  http://localhost:4000                       │
│           (Single GraphQL endpoint for all services)         │
└────┬────────────────────────────────────────────────┬────────┘
     │                                                 │
     │ Federation                                      │ Federation
     ▼                                                 ▼
┌──────────────────────┐                    ┌──────────────────────────┐
│   User Service       │◄───── RabbitMQ ───►│  Agent Configs Service   │
│  localhost:4001      │                    │    localhost:4003        │
│                      │                    │                          │
│ - User CRUD          │    Event Bus       │ - AI Agent Configs       │
│ - Auth (merged)      │                    │ - Requires Auth          │
│ - Register/Login     │                    │ - User-specific configs  │
│ - JWT tokens         │                    │                          │
└──────┬───────────────┘                    └──────┬───────────────────┘
       │                                           │
       ▼                                           ▼
┌──────────────────┐                      ┌──────────────────────┐
│  MongoDB User    │                      │  MongoDB Agent       │
│   Port: 27017    │                      │    Port: 27017       │
│ (users + auth)   │                      │                      │
└──────────────────┘                      └──────────────────────┘

              ┌──────────────────────────┐
              │      RabbitMQ            │
              │   Management: :15672     │
              │   AMQP: :5672            │
              └──────────────────────────┘
```

## 📁 Project Structure

```
backend/
├── package.json              # Root workspace configuration
├── tsconfig.json            # Shared TypeScript config
├── .env.example            # Environment variables template
│
├── shared/                  # Shared package for all services
│   ├── src/
│   │   ├── types/          # Common types
│   │   ├── rabbitmq/       # RabbitMQ client wrapper
│   │   └── utils/          # Utility functions
│   └── package.json
│
├── services/
│   ├── user-service/       # User management + Auth microservice
│   │   ├── src/
│   │   │   ├── index.ts       # Server entry point
│   │   │   ├── schema.ts      # GraphQL schema (Federation)
│   │   │   ├── resolvers.ts   # GraphQL resolvers
│   │   │   ├── auth.ts        # JWT utilities
│   │   │   └── database.ts    # MongoDB connection (users + auth)
│   │   └── package.json
│   │
│   └── agent-configs-service/  # AI Agent configurations microservice
│       ├── src/
│       │   ├── index.ts       # Server entry point
│       │   ├── schema.ts      # GraphQL schema
│       │   ├── resolvers.ts   # Config resolvers
│       │   ├── auth.ts        # Token verification
│       │   └── database.ts    # MongoDB connection
│       └── package.json
│
└── gateway/                # Apollo Gateway
    ├── src/
    │   └── index.ts        # Gateway configuration
    └── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MongoDB (local installation or cloud instance)
- RabbitMQ (optional, for event-driven communication)

### 1. Install Dependencies

```bash
cd backend
npm install
```

This will install dependencies for all workspaces (shared, services, gateway).

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration if needed. The defaults work for local development.

### 3. Setup MongoDB and RabbitMQ

Ensure you have MongoDB running locally on port 27017, or update the connection strings in your `.env` file to point to your MongoDB instance.

RabbitMQ is optional. If not available, services will run without event messaging.

### 4. Start All Services

```bash
npm run dev
```

This starts all services in parallel:
- **User Service**: http://localhost:4001/graphql
- **Agent Configs Service**: http://localhost:4003/graphql
- **Apollo Gateway**: http://localhost:4000/graphql

Or start services individually:

```bash
npm run dev:user            # User service only
npm run dev:agent-configs   # Agent configs service only
npm run dev:gateway         # Gateway only
```

### 5. Test the API

Open http://localhost:4000 in your browser to access the GraphQL Playground.

## 📊 Available GraphQL Operations

### User Service Operations

```graphql
# Get all users
query GetUsers {
  users {
    id
    name
    email
    createdAt
  }
}

# Get single user
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    createdAt
  }
}

# Create user
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    name
    email
    createdAt
  }
}

# Update user
mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
  updateUser(id: $id, input: $input) {
    id
    name
    email
    updatedAt
  }
}

# Delete user
mutation DeleteUser($id: ID!) {
  deleteUser(id: $id)
}
```

### Auth Operations (User Service)

```graphql
# Register new user
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    user {
      id
      email
    }
    tokens {
      accessToken
      refreshToken
    }
  }
}

# Login
mutation Login($input: LoginInput!) {
  login(input: $input) {
    user {
      id
      email
    }
    tokens {
      accessToken
      refreshToken
    }
  }
}

# Refresh token
mutation RefreshToken($refreshToken: String!) {
  refreshToken(refreshToken: $refreshToken) {
    accessToken
    refreshToken
  }
}

# Validate token
query ValidateToken($token: String!) {
  validateToken(token: $token)
}
```

### Agent Configs Service Operations

Note: All agent config operations require authentication via Bearer token.

```graphql
# Get all agent configs for authenticated user
query GetAgentConfigs {
  agentConfigs {
    id
    userId
    name
    prompt
    model
    temperature
    maxTokens
    createdAt
  }
}

# Get single agent config
query GetAgentConfig($id: ID!) {
  agentConfig(id: $id) {
    id
    userId
    name
    prompt
    model
    temperature
    maxTokens
    createdAt
  }
}

# Create agent config
mutation CreateAgentConfig($input: CreateAgentConfigInput!) {
  createAgentConfig(input: $input) {
    id
    name
    prompt
    model
    temperature
    maxTokens
  }
}

# Update agent config
mutation UpdateAgentConfig($id: ID!, $input: UpdateAgentConfigInput!) {
  updateAgentConfig(id: $id, input: $input) {
    id
    name
    prompt
    model
    temperature
    maxTokens
    updatedAt
  }
}

# Delete agent config
mutation DeleteAgentConfig($id: ID!) {
  deleteAgentConfig(id: $id)
}
```

### Federated Query Example

Thanks to Apollo Federation, you can query across services:

```graphql
query GetUserWithAuth($id: ID!) {
  user(id: $id) {
    id
    name
    email
    hasPassword  # This field checks if user has a password
  }
}
```

## 🔧 How Federation Works

### User Service (Defines the User Entity)

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
  email: String!
  createdAt: String!
}
```

The `@key` directive marks `User` as a federated entity that can be extended by other services.

### Agent Configs Service (Separate Entity)

```graphql
type AgentConfig @key(fields: "id") {
  id: ID!
  userId: ID!
  name: String!
  prompt: String!
  model: String!
  temperature: Float!
  maxTokens: Int!
  createdAt: String!
  updatedAt: String
}
```

The Agent Configs Service manages AI agent configurations, requiring authentication to access user-specific configs.

## 🐰 RabbitMQ Event-Driven Communication

Services communicate asynchronously via RabbitMQ:

### Event Types

- `user.created` - Published by User Service when a user is created
- `user.updated` - Published by User Service when a user is updated
- `user.deleted` - Published by User Service when a user is deleted
- `user.registered` - Published by User Service when a user registers
- `user.login` - Published by User Service when a user logs in

### Example Event Flow: User Registration

1. Client calls `register` mutation on User Service
2. User Service creates user record in database
3. User Service stores password hash in auth collection
4. User Service generates JWT tokens
5. User Service publishes `user.registered` event to RabbitMQ
6. Other services can listen and react to this event

## ➕ Adding a New Service

Follow these steps to add a new microservice:

### 1. Create Service Directory

```bash
mkdir -p services/your-service/src
cd services/your-service
```

### 2. Create package.json

```json
{
  "name": "your-service",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "shared": "*",
    "@apollo/server": "^4.10.0",
    "@apollo/subgraph": "^2.6.3",
    "graphql": "^16.8.1",
    "mongodb": "^6.3.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

### 3. Create tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../../shared" }]
}
```

### 4. Create GraphQL Schema (src/schema.ts)

```typescript
import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", 
          import: ["@key", "@external"])

  type YourEntity @key(fields: "id") {
    id: ID!
    # your fields here
  }

  type Query {
    yourQuery: YourEntity
  }

  type Mutation {
    yourMutation: YourEntity
  }
`;
```

### 5. Create Resolvers (src/resolvers.ts)

```typescript
import { Database } from './database';
import { RabbitMQClient } from 'shared';

export const createResolvers = (db: Database, rabbitMQ: RabbitMQClient) => ({
  Query: {
    yourQuery: async () => {
      // Implementation
    },
  },
  Mutation: {
    yourMutation: async () => {
      // Implementation
    },
  },
});
```

### 6. Create Server (src/index.ts)

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { Database } from './database';
import { RabbitMQClient } from 'shared';

async function startServer() {
  const db = new Database();
  await db.connect();

  const rabbitMQ = new RabbitMQClient();
  await rabbitMQ.connect();

  const resolvers = createResolvers(db, rabbitMQ);
  const server = new ApolloServer({
    schema: buildSubgraphSchema({ typeDefs, resolvers }),
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: 4003 }, // Use next available port
    context: async () => ({ db, rabbitMQ }),
  });

  console.log(`🚀 Your Service ready at ${url}`);
}

startServer();
```

### 7. Register Service in Gateway (gateway/src/index.ts)

```typescript
subgraphs: [
  // ... existing services
  {
    name: 'your-service',
    url: 'http://localhost:4003/graphql',
  },
]
```

### 8. Add Run Scripts (root package.json)

```json
"scripts": {
  "dev:your": "npm run dev --workspace=your-service",
  "build:your": "npm run build --workspace=your-service"
}
```

### 9. Install and Start

```bash
cd ../../
npm install
npm run dev
```

## 🔨 Build for Production

```bash
# Build all services
npm run build

# Or build individually
npm run build:shared
npm run build:user
npm run build:agent-configs
npm run build:gateway
```

## 🧪 Testing

Each service can be tested independently by querying its GraphQL endpoint directly:

- User Service: http://localhost:4001/graphql
- Agent Configs Service: http://localhost:4003/graphql

Or test the federated graph via the Gateway: http://localhost:4000/graphql

## 📦 Technology Stack

- **Language**: TypeScript
- **API Layer**: GraphQL with Apollo Server
- **Federation**: Apollo Federation v2
- **Message Broker**: RabbitMQ
- **Database**: MongoDB (one per service)
- **Package Manager**: npm workspaces
- **Development**: tsx (TypeScript execute)

## 🛠️ Useful Commands

```bash
# Clean all node_modules
npm run clean

# Build everything
npm run build

# Start all services
npm run dev
```

## 🔐 Environment Variables

See `.env.example` for all configuration options. Key variables:

- `RABBITMQ_URL` - RabbitMQ connection string (optional)
- `USER_SERVICE_MONGODB_URI` - User service database (includes auth data)
- `AGENT_CONFIGS_SERVICE_MONGODB_URI` - Agent configs service database
- `JWT_SECRET` - Secret key for JWT signing
- `GATEWAY_PORT` - Gateway port (default: 4000)
- `USER_SERVICE_PORT` - User service port (default: 4001)
- `AGENT_CONFIGS_SERVICE_PORT` - Agent configs service port (default: 4003)

## 📝 Best Practices

1. **Database per Service**: Each microservice has its own MongoDB database
2. **Event-Driven**: Use RabbitMQ for async communication between services
3. **Federation for Sync**: Use GraphQL federation for synchronous data queries
4. **Shared Code**: Common types and utilities live in the `shared` package
5. **Graceful Shutdown**: All services handle SIGTERM/SIGINT properly
6. **Error Handling**: GraphQL errors are properly formatted and logged

## 🚧 Next Steps

- Add authentication middleware to gateway
- Implement rate limiting
- Add request logging and monitoring
- Set up automated tests
- Add API documentation
- Implement caching layer (Redis)
- Add health check endpoints
- Set up CI/CD pipeline

## 📚 Resources

- [Apollo Federation Docs](https://www.apollographql.com/docs/federation/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [MongoDB Node.js Driver](https://mongodb.github.io/node-mongodb-native/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 📄 License

MIT

