# Integration Tests Setup

This directory contains integration tests for the Context Manager implementations that test against real services.

## Prerequisites

Before running integration tests, ensure you have:

1. **MongoDB** running locally at `mongodb://localhost:27017`
2. **Pinecone** account with:
   - API key with write permissions
   - Index named `context-manager` with 768 dimensions
3. **Ollama** running locally at `http://localhost:11434`
   - Model `nomic-text` loaded (for 768-dim embeddings)

## Environment Setup

Create a `.env.test` file in the `backend/shared` directory with the following variables:

```env
# MongoDB Configuration
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=context-manager-test

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key-here
PINECONE_INDEX_NAME=context-manager

# Ollama Configuration
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=nomic-text
```

## Running Tests

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Specific Integration Tests
```bash
# LocalFile only
npm run test:integration:local

# MongoDB only
npm run test:integration:mongo

# Pinecone only (requires Ollama)
npm run test:integration:pinecone

# Factory only
npm run test:integration:factory
```

### Run Unit Tests Only
```bash
npm run test:unit
```

## Test Coverage

Integration tests verify:
- Real file system operations (LocalFile)
- Real MongoDB connections and operations (Mongo)
- Real Pinecone vector operations with Ollama embeddings (Pinecone)
- Factory pattern with all three implementations

## Cleanup

All integration tests automatically clean up test data after completion. Test sessions are tagged with `test-` prefix for easy identification.

