# AI Service Integration Tests

This directory contains integration tests for the AI Service that test against real services, including local Ollama.

## Prerequisites

Before running integration tests, ensure you have:

1. **MongoDB** running locally at `mongodb://localhost:27017`
2. **Ollama** running locally at `http://localhost:11434`
   - At least one model available (default: `llama2`)
   - Models can be pulled with: `ollama pull llama2`

## Environment Setup

Create a `.env.test` file in the `backend/services/ai-service` directory (optional):

```env
# MongoDB Configuration
AI_SERVICE_MONGODB_URI=mongodb://localhost:27017/ai_service_test
AGENT_CONFIGS_SERVICE_MONGODB_URI=mongodb://localhost:27017/agent_configs_service

# Ollama Configuration
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# JWT Secret (for test tokens)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

## Running Tests

### Run All Integration Tests
```bash
cd backend/services/ai-service
npm run test:integration
```

### Run All Tests (including unit tests if added)
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

## Test Structure

### `ask-mode.integration.test.ts`
Tests the core Ask Mode functionality:
- Basic ask queries with Ollama
- Conversation context maintenance
- Session management
- ConversationService operations
- LLM Provider (Ollama) integration
- Error handling

### `graphql-api.integration.test.ts`
Tests the GraphQL API:
- `ask` mutation via GraphQL
- `conversation` query via GraphQL
- Authentication requirements
- Full end-to-end API flow

## Test Data Management

All tests:
- Create test agent configs in MongoDB (agent-configs-service database)
- Create test conversations in MongoDB (ai-service database)
- Clean up all test data after each test
- Use unique test user IDs and session IDs

## What Gets Tested

✅ **AskModeHandler**
- Processing queries with Ollama
- Maintaining conversation context
- Auto-generating session IDs
- Error handling

✅ **ConversationService**
- Session creation and retrieval
- Message storage and retrieval
- Agent config fetching from MongoDB

✅ **LLM Providers**
- OllamaProvider integration
- Response generation
- Error handling

✅ **GraphQL API**
- ask mutation
- conversation query
- Authentication
- End-to-end flows

## Notes

- Tests use MongoDB for context management (not Pinecone) to avoid requiring Pinecone API keys
- Tests create agent configs directly in MongoDB for speed
- Ollama must be running locally - tests will skip if unavailable
- Tests check for model availability and use available models

