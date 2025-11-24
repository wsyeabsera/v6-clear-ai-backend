# Pinecone Integration Testing Setup

## Current Status

❌ **Pinecone integration tests are NOT running** because the API key is not configured.

## What's Missing

The integration tests check for `PINECONE_API_KEY` environment variable. If it's not set, tests are skipped.

## How to Actually Test Pinecone

### Step 1: Create `.env.test` file

Create `backend/shared/.env.test` with:

```env
# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key-here
PINECONE_INDEX_NAME=context-manager

# Ollama Configuration (for embeddings)
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=nomic-text

# MongoDB Configuration (for other tests)
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=context-manager-test
```

### Step 2: Verify Pinecone Index Exists

The tests expect an index named `context-manager` with 768 dimensions (for nomic-text embeddings).

If you need a different index name, update `PINECONE_INDEX_NAME` in `.env.test`.

### Step 3: Run Pinecone Tests

```bash
cd backend/shared
npm run test:integration:pinecone
```

### Step 4: Verify Results

The tests should:
- ✅ Connect to Pinecone
- ✅ Store and retrieve context data
- ✅ Generate embeddings (if Ollama is available)
- ✅ Clean up test data

## What Tests Will Run

Once configured, these integration tests will execute:

1. **PineconeContextManager Integration Tests** (15 tests)
   - Basic CRUD operations
   - Message management
   - Embedding generation
   - Similarity search
   - Error handling

2. **PineconeMemorySystem Integration Tests** (13 tests)
   - Short-term memory storage
   - Long-term memory storage
   - Similarity search
   - Conversation history
   - Error handling

## Current Test Results

Without Pinecone configured:
- ✅ Unit tests pass (using mocks)
- ⚠️ Integration tests skipped (no real Pinecone testing)

**This means Pinecone functionality is NOT verified to work with real data.**
