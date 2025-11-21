# V6 Clear AI - Architecture Notes
## Building Ask/Plan/Agent Modes from the Ground Up

> **Goal**: Build a Cursor-like system with Ask, Plan, and Agent modes, learning from v5's decoupling challenges.

---

## Table of Contents

1. [Current Foundation](#current-foundation)
2. [Core Architectural Principles](#core-architectural-principles)
3. [The Kernel Pattern](#the-kernel-pattern)
4. [Mode Architecture](#mode-architecture)
5. [Service Boundaries](#service-boundaries)
6. [Integration Strategy](#integration-strategy)
7. [RabbitMQ Event Strategy](#rabbitmq-event-strategy)
8. [GraphQL Schema Design](#graphql-schema-design)
9. [Implementation Steps](#implementation-steps)
10. [Open Questions](#open-questions)

---

## Current Foundation

### What We Have

✅ **Auth Service** (user-service)
- JWT authentication
- User management (CRUD)
- Register/Login/RefreshToken
- MongoDB for users + auth data

✅ **Agent Config Service** (agent-configs-service)
- Stores AI agent configurations per user
- Requires authentication
- User-specific configs
- MongoDB for configs

✅ **RabbitMQ Setup**
- Shared RabbitMQ client in `shared` package
- Exchanges: `users`, `auth`
- Queues: `user-service`, `auth-service`
- Event-driven communication

✅ **Apollo Gateway**
- GraphQL federation
- Single endpoint for all services
- Header forwarding for auth

✅ **Shared Package**
- Common types
- RabbitMQ client wrapper
- Utility functions

### Architecture Pattern
- **Microservices**: Each service = own DB, own concerns
- **Event-Driven**: RabbitMQ for async communication
- **GraphQL Federation**: Sync queries across services

---

## Core Architectural Principles

### 1. Mode Abstraction Layer

Three modes share a common foundation but differ in execution depth:

- **Ask Mode**: Fast path - direct LLM response, minimal orchestration
- **Plan Mode**: Structured thinking - plan generation, NO execution
- **Agent Mode**: Full execution - plan → execute → reflect → iterate

**Shared Foundation:**
- Query understanding (intent classification)
- Context management (conversation history, references)
- Tool discovery (semantic search, tool registry)
- Response formatting (streaming, markdown, code blocks)

### 2. The Kernel Pattern

A minimal, reusable core that all modes use:

```
Kernel = {
  - Context Manager (conversation state, references)
  - Tool Registry (discovery, validation, execution)
  - Memory System (short-term, long-term, semantic)
  - Event Bus (internal communication)
  - Stream Manager (real-time updates)
}
```

Each mode is a plugin that uses the kernel differently:
- **Ask**: Kernel → LLM → Response
- **Plan**: Kernel → Thought → Planner → Plan Document
- **Agent**: Kernel → Thought → Planner → Executor → Reflector → Iterate

### 3. Decoupling Strategy: Dependency Inversion

Instead of layers calling each other directly:

```
❌ Bad (v5): Orchestrator → Agents → Basis
✅ Good (v6): All modes → Kernel → Adapters → Services
```

The kernel defines **interfaces**; implementations are swappable:
- `IToolExecutor` (could be MCP, HTTP, gRPC)
- `IMemoryStore` (could be Pinecone, local, hybrid)
- `IStreamHandler` (could be SSE, WebSocket, polling)

### 4. Shared Responsibilities Matrix

| Responsibility | Kernel | Mode | Service |
|---|---|---|---|
| Context tracking | ✅ | ❌ | ❌ |
| Tool discovery | ✅ | ❌ | ❌ |
| Intent classification | ✅ | ❌ | ❌ |
| Plan generation | ❌ | ✅ (Plan/Agent) | ❌ |
| Execution | ❌ | ✅ (Agent only) | ✅ |
| Memory storage | ❌ | ❌ | ✅ |
| Streaming | ✅ | ❌ | ❌ |

---

## The Kernel Pattern

### Kernel Components

#### 1. Context Manager
**Purpose**: Manages conversation state and context

**Responsibilities:**
- Conversation history (session-based)
- Reference resolution ("that file" → actual file path)
- User preferences (from user service)
- Agent config (from agent-configs service)
- Session management

**Interface:**
```typescript
interface IContextManager {
  getContext(sessionId: string): Promise<ConversationContext>;
  addMessage(sessionId: string, message: Message): Promise<void>;
  resolveReference(sessionId: string, reference: string): Promise<string | null>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  getAgentConfig(userId: string, configId?: string): Promise<AgentConfig>;
}
```

#### 2. Tool Registry
**Purpose**: Manages tool discovery and execution

**Responsibilities:**
- Tool discovery (semantic + keyword search)
- Schema validation
- Execution abstraction (MCP, HTTP, etc.)
- Tool performance tracking

**Interface:**
```typescript
interface IToolRegistry {
  discoverTools(query: string, limit?: number): Promise<Tool[]>;
  validateTool(toolName: string, params: any): Promise<ValidationResult>;
  executeTool(toolName: string, params: any): Promise<ToolResult>;
  getToolPerformance(toolName: string): Promise<ToolPerformance>;
}
```

#### 3. Memory System
**Purpose**: Manages short-term and long-term memory

**Responsibilities:**
- Short-term memory (conversation context)
- Long-term memory (persistent learnings)
- Semantic search (vector embeddings)
- Pattern recognition

**Interface:**
```typescript
interface IMemorySystem {
  storeShortTerm(sessionId: string, data: any): Promise<void>;
  storeLongTerm(userId: string, data: any): Promise<void>;
  searchSimilar(query: string, limit?: number): Promise<Memory[]>;
  getConversationHistory(sessionId: string): Promise<Message[]>;
}
```

#### 4. Event Bus
**Purpose**: Internal and external event communication

**Responsibilities:**
- Internal pub/sub (within service)
- RabbitMQ integration (cross-service)
- Event logging
- Middleware (validation, transformation)

**Interface:**
```typescript
interface IEventBus {
  publish(event: string, data: any): Promise<void>;
  subscribe(event: string, handler: EventHandler): Promise<void>;
  emit(event: string, data: any): Promise<void>; // Internal only
  on(event: string, handler: EventHandler): void; // Internal only
}
```

#### 5. Stream Manager
**Purpose**: Unified streaming interface

**Responsibilities:**
- Unified streaming interface
- Mode-agnostic streaming
- Reconnection handling
- Buffering

**Interface:**
```typescript
interface IStreamManager {
  createStream(sessionId: string): Stream;
  sendChunk(stream: Stream, chunk: any): Promise<void>;
  closeStream(stream: Stream): Promise<void>;
  handleReconnection(sessionId: string): Promise<Stream>;
}
```

### Kernel Location

**Option 1**: In `shared` package
- Pros: Available to all services immediately
- Cons: Might bloat shared package

**Option 2**: Separate `kernel` package
- Pros: Clear separation, versioned independently
- Cons: Another package to manage

**Recommendation**: Start in `shared`, extract to `kernel` package later if needed.

---

## Mode Architecture

### Ask Mode

**Purpose**: Fast, direct LLM responses with minimal orchestration

**Flow:**
```
User Query
  ↓
Ask Handler
  ↓
Kernel.ContextManager.getContext()
Kernel.ToolRegistry.discoverTools() (optional, for tool-aware answers)
  ↓
LLM Call (single pass, fast)
  ↓
Response (streamed back)
```

**Characteristics:**
- Single LLM call
- No planning phase
- No execution phase
- Fast response time
- Can use tools for context (read files, search) but doesn't execute actions

**Use Cases:**
- Quick questions
- Code explanations
- Documentation lookups
- Simple queries

**Events:**
- `ai-service.ask.query.received`
- `ai-service.ask.response.generated`
- `ai-service.ask.response.sent`

### Plan Mode

**Purpose**: Generate structured plans without execution

**Flow:**
```
User Query
  ↓
Plan Handler
  ↓
Kernel.ContextManager.getContext()
Kernel.MemorySystem.searchSimilarPlans()
  ↓
Thought Agent (reasoning)
  ↓
Planner Agent (structured plan)
  ↓
Plan Document (returned, NOT executed)
```

**Characteristics:**
- Multi-step reasoning
- Structured plan output
- No execution
- Can reference tools but doesn't call them
- Returns plan as document

**Use Cases:**
- Complex task breakdown
- Project planning
- Multi-step workflows
- Strategy development

**Events:**
- `ai-service.plan.query.received`
- `ai-service.plan.thought.completed`
- `ai-service.plan.plan.generated`
- `ai-service.plan.completed`

### Agent Mode

**Purpose**: Full execution with planning, execution, and reflection

**Flow:**
```
User Query
  ↓
Agent Handler
  ↓
Kernel.ContextManager.getContext()
Kernel.MemorySystem.searchSimilarExecutions()
  ↓
Thought Agent → Planner Agent → Executor Agent
  ↓
RabbitMQ Events (execution progress)
  ↓
Reflection Agent (analyze results)
  ↓
Iterate if needed
  ↓
Final Results
```

**Characteristics:**
- Full reasoning chain
- Actual tool execution
- Iterative refinement
- Progress tracking
- Error handling and recovery

**Use Cases:**
- Code changes
- File operations
- Complex multi-step tasks
- Automated workflows

**Events:**
- `ai-service.agent.query.received`
- `ai-service.agent.thought.completed`
- `ai-service.agent.plan.completed`
- `ai-service.agent.executor.started`
- `ai-service.agent.executor.step.progress`
- `ai-service.agent.executor.completed`
- `ai-service.agent.reflection.completed`
- `ai-service.agent.execution.completed`

---

## Service Boundaries

### AI Service (New Microservice)

**Responsibilities:**
- Mode routing (ask/plan/agent)
- Mode handlers
- Kernel orchestration
- LLM integration
- Streaming responses
- Conversation management

**Does NOT:**
- Store user data (uses User Service)
- Store agent configs (uses Agent Configs Service)
- Store long-term memory (uses Memory Service - future)
- Execute tools directly (uses Tool Service - future)

**Database:**
- Conversations (session-based)
- Short-term context
- Execution history (Agent mode)

**Port:** 4005 (or next available)

### Future Services (As You Scale)

#### Memory Service (Future)
**Responsibilities:**
- Long-term memory storage
- Vector embeddings
- Semantic search
- Learning from executions

#### Tool Service (Future)
**Responsibilities:**
- Tool registry
- Tool execution
- Tool performance tracking
- MCP client management

---

## Integration Strategy

### Auth Integration

**How it works:**
- Kernel gets `userId` from JWT (already in GraphQL context)
- Kernel fetches user preferences from User Service via GraphQL
- Kernel fetches agent config from Agent Configs Service via GraphQL

**Implementation:**
```typescript
// In AI Service context
const userId = context.userId; // From JWT
const userPreferences = await userServiceClient.getUserPreferences(userId);
const agentConfig = await agentConfigsServiceClient.getAgentConfig(userId, configId);
```

### Agent Config Integration

**Strategy:**
- Each mode can use different agent configs
- Ask Mode: "fast-ask" config (low temp, fast model)
- Plan Mode: "planning" config (higher temp, reasoning model)
- Agent Mode: "execution" config (balanced, tool-aware)

**Config Selection:**
- User can specify configId per request
- Default config per mode
- User preferences can override

### RabbitMQ Integration

**Event Publishing:**
- Ask Mode: Minimal events (query.received, response.sent)
- Plan Mode: Events for plan generation steps
- Agent Mode: Rich events (all execution stages)

**Event Consumption:**
- AI Service can listen to user events (user.updated, user.deleted)
- Other services can listen to AI events (execution.completed)

---

## RabbitMQ Event Strategy

### Event Naming Convention

```
{service}.{entity}.{action}
{service}.{mode}.{stage}

Examples:
- ai-service.ask.query.received
- ai-service.plan.thought.completed
- ai-service.agent.executor.step.progress
- ai-service.agent.execution.completed
```

### Exchange Strategy

**Exchanges:**
- `ai-service` (all AI service events)
- `users` (user events - existing)
- `auth` (auth events - existing)

**Queues:**
- `ai-service.ask` (Ask mode events)
- `ai-service.plan` (Plan mode events)
- `ai-service.agent` (Agent mode events)
- `ai-service.events` (all AI events for monitoring)

### Event Flow Examples

**Ask Mode:**
```
query.received → response.generated → response.sent
```

**Plan Mode:**
```
query.received → thought.completed → plan.generated → plan.completed
```

**Agent Mode:**
```
query.received → thought.completed → plan.completed → 
executor.started → executor.step.progress → executor.completed → 
reflection.completed → execution.completed
```

### Event Payload Structure

```typescript
interface MessageEvent {
  type: EventType;
  timestamp: string;
  sessionId: string;
  userId: string;
  data: {
    // Mode-specific data
    query?: string;
    response?: string;
    plan?: Plan;
    execution?: Execution;
    step?: ExecutionStep;
    // ... other fields
  };
}
```

---

## GraphQL Schema Design

### AI Service Schema

```graphql
type Query {
  # Get conversation history
  conversation(sessionId: ID!): Conversation
  
  # Get execution history (Agent mode)
  executions(sessionId: ID!, limit: Int): [Execution]
  
  # Get plan history (Plan mode)
  plans(sessionId: ID!, limit: Int): [Plan]
}

type Mutation {
  # Ask mode
  ask(
    query: String!
    sessionId: ID
    configId: ID
  ): AskResponse
  
  # Plan mode
  plan(
    query: String!
    sessionId: ID
    configId: ID
  ): PlanResponse
  
  # Agent mode
  execute(
    query: String!
    sessionId: ID
    configId: ID
  ): ExecutionResponse
}

type Subscription {
  # Stream responses
  streamResponse(sessionId: ID!): StreamEvent
}

# Types
type Conversation {
  id: ID!
  sessionId: ID!
  userId: ID!
  messages: [Message!]!
  createdAt: String!
  updatedAt: String!
}

type Message {
  id: ID!
  role: MessageRole!
  content: String!
  timestamp: String!
}

type AskResponse {
  id: ID!
  sessionId: ID!
  response: String!
  tokensUsed: Int
  model: String!
  timestamp: String!
}

type PlanResponse {
  id: ID!
  sessionId: ID!
  plan: Plan!
  confidence: Float!
  timestamp: String!
}

type Plan {
  id: ID!
  steps: [PlanStep!]!
  estimatedDuration: Int
  requiredTools: [String!]!
}

type PlanStep {
  id: ID!
  order: Int!
  description: String!
  tool: String
  parameters: JSON
  dependencies: [Int!]!
}

type ExecutionResponse {
  id: ID!
  sessionId: ID!
  execution: Execution!
  timestamp: String!
}

type Execution {
  id: ID!
  plan: Plan!
  status: ExecutionStatus!
  steps: [ExecutionStep!]!
  results: JSON
  error: String
  startedAt: String!
  completedAt: String
}

type ExecutionStep {
  id: ID!
  planStepId: ID!
  status: StepStatus!
  result: JSON
  error: String
  startedAt: String!
  completedAt: String
}

type StreamEvent {
  type: StreamEventType!
  data: JSON!
  timestamp: String!
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
}

enum ExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum StepStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED
}

enum StreamEventType {
  CHUNK
  STEP_STARTED
  STEP_COMPLETED
  EXECUTION_COMPLETED
  ERROR
}
```

### Federation Extensions

**Extend User:**
```graphql
extend type User @key(fields: "id") {
  id: ID! @external
  conversations: [Conversation!]!
  executions: [Execution!]!
}
```

**Extend AgentConfig:**
```graphql
extend type AgentConfig @key(fields: "id") {
  id: ID! @external
  executions: [Execution!]!
  plans: [Plan!]!
}
```

---

## Implementation Steps

### Phase 1: Foundation (Week 1)

1. **Create Kernel Interfaces** (in shared package)
   - [ ] Define `IContextManager` interface
   - [ ] Define `IToolRegistry` interface
   - [ ] Define `IMemorySystem` interface
   - [ ] Define `IEventBus` interface
   - [ ] Define `IStreamManager` interface

2. **Create AI Service Structure**
   - [ ] Create `services/ai-service` directory
   - [ ] Set up package.json with dependencies
   - [ ] Set up TypeScript config
   - [ ] Create basic Apollo Server setup

3. **Implement Basic Kernel Adapters**
   - [ ] Implement `ContextManager` (basic version)
   - [ ] Implement `EventBus` (RabbitMQ integration)
   - [ ] Implement `StreamManager` (basic streaming)

### Phase 2: Ask Mode (Week 2)

1. **Implement Ask Handler**
   - [ ] Create `AskModeHandler` class
   - [ ] Integrate with LLM (Claude/GPT)
   - [ ] Implement streaming response
   - [ ] Add GraphQL mutation

2. **Context Integration**
   - [ ] Fetch user preferences from User Service
   - [ ] Fetch agent config from Agent Configs Service
   - [ ] Implement conversation history

3. **Testing**
   - [ ] Unit tests for Ask Handler
   - [ ] Integration tests with real services
   - [ ] E2E test for Ask flow

### Phase 3: Plan Mode (Week 3)

1. **Implement Thought Agent**
   - [ ] Create `ThoughtAgent` class
   - [ ] Implement reasoning logic
   - [ ] Integrate with memory system

2. **Implement Planner Agent**
   - [ ] Create `PlannerAgent` class
   - [ ] Convert thoughts to structured plans
   - [ ] Handle dependencies

3. **Implement Plan Handler**
   - [ ] Create `PlanModeHandler` class
   - [ ] Chain Thought → Planner
   - [ ] Return plan document
   - [ ] Add GraphQL mutation

4. **Testing**
   - [ ] Unit tests for agents
   - [ ] Integration tests
   - [ ] E2E test for Plan flow

### Phase 4: Agent Mode (Week 4)

1. **Implement Executor Agent**
   - [ ] Create `ExecutorAgent` class
   - [ ] Execute plan steps
   - [ ] Handle tool execution
   - [ ] Progress tracking

2. **Implement Reflection Agent**
   - [ ] Create `ReflectionAgent` class
   - [ ] Analyze execution results
   - [ ] Determine if iteration needed

3. **Implement Agent Handler**
   - [ ] Create `AgentModeHandler` class
   - [ ] Chain all agents
   - [ ] Handle iteration logic
   - [ ] Add GraphQL mutation

4. **Testing**
   - [ ] Unit tests for all agents
   - [ ] Integration tests
   - [ ] E2E test for Agent flow

### Phase 5: Integration & Polish (Week 5)

1. **Mode Router**
   - [ ] Create `ModeRouter` class
   - [ ] Route queries to appropriate mode
   - [ ] Handle mode switching

2. **RabbitMQ Events**
   - [ ] Implement all event types
   - [ ] Set up exchanges and queues
   - [ ] Add event consumers

3. **GraphQL Federation**
   - [ ] Extend User type
   - [ ] Extend AgentConfig type
   - [ ] Register in Gateway

4. **Documentation**
   - [ ] API documentation
   - [ ] Architecture diagrams
   - [ ] Developer guide

---

## Open Questions

### 1. Where does conversation state live?
- [ ] In AI Service DB?
- [ ] In a separate Conversation Service?
- [ ] How do you handle multi-device sessions?

**Decision:** TBD

### 2. How do you handle tool execution?
- [ ] MCP client in AI Service?
- [ ] Separate Tool Service?
- [ ] How do you handle long-running tool executions?

**Decision:** TBD

### 3. Memory boundaries
- [ ] What's session memory vs. long-term memory?
- [ ] Where does semantic search live? (Pinecone? Separate service?)

**Decision:** TBD

### 4. Streaming strategy
- [ ] GraphQL subscriptions?
- [ ] WebSocket?
- [ ] SSE?
- [ ] How do you handle reconnections?

**Decision:** TBD

### 5. Agent config per mode
- [ ] One config for all modes?
- [ ] Separate configs per mode?
- [ ] How do users switch between configs?

**Decision:** TBD

### 6. Tool Registry
- [ ] Where do tools come from?
- [ ] MCP servers?
- [ ] HTTP APIs?
- [ ] How do you discover new tools?

**Decision:** TBD

### 7. Error Handling
- [ ] Centralized in kernel?
- [ ] Mode-specific?
- [ ] How do you handle partial failures in Agent mode?

**Decision:** TBD

### 8. Cost Tracking
- [ ] Track LLM costs per mode?
- [ ] Track tool execution costs?
- [ ] Per user? Per session?

**Decision:** TBD

---

## Key Decisions Log

### Decision 1: Service Architecture
**Date:** [TBD]
**Decision:** Single AI Service with mode handlers (Option A)
**Rationale:** Easier to start, can split later if needed
**Status:** ✅ Decided

### Decision 2: Kernel Location
**Date:** [TBD]
**Decision:** Start in `shared` package, extract later if needed
**Rationale:** Faster iteration, less overhead
**Status:** ✅ Decided

### Decision 3: [TBD]
**Date:** [TBD]
**Decision:** [TBD]
**Rationale:** [TBD]
**Status:** ⏳ Pending

---

## Notes & Ideas

### Ideas to Explore
- [ ] Mode switching mid-conversation
- [ ] Hybrid mode (Ask with Plan preview)
- [ ] Plan execution from Plan mode
- [ ] Collaborative planning (multiple users)
- [ ] Plan templates
- [ ] Execution replay
- [ ] Plan optimization suggestions

### Lessons from v5
- ✅ Decouple early - interfaces over implementations
- ✅ Event-driven for async operations
- ✅ Shared package for common code
- ✅ Microservices for independent scaling
- ⚠️ Don't over-engineer - start simple
- ⚠️ Clear service boundaries prevent coupling
- ⚠️ Testing strategy from day one

---

## Resources

- [Apollo Federation Docs](https://www.apollographql.com/docs/federation/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [Cursor Architecture (reference)](https://cursor.sh)

---

**Last Updated:** [Date]
**Version:** 0.1.0

