# V6 Clear AI - Frontend Architecture Notes
## Building Ask/Plan/Agent UI from the Ground Up

> **Goal**: Build a Cursor-like frontend with Ask, Plan, and Agent modes, with real-time updates and beautiful UX.

---

## Table of Contents

1. [Current Frontend Setup](#current-frontend-setup)
2. [Frontend Architecture Principles](#frontend-architecture-principles)
3. [Page Structure](#page-structure)
4. [Component Architecture](#component-architecture)
5. [State Management Strategy](#state-management-strategy)
6. [API Integration](#api-integration)
7. [Real-Time Updates](#real-time-updates)
8. [UI/UX Patterns](#uiux-patterns)
9. [Implementation Steps](#implementation-steps)
10. [Open Questions](#open-questions)

---

## Current Frontend Setup

### What We Have

✅ **Next.js 16** with App Router
- App directory structure
- Server and client components
- Route handling

✅ **TypeScript**
- Type safety throughout
- Type definitions in `src/types`

✅ **Tailwind CSS 4**
- Utility-first styling
- Custom components

✅ **React Query (TanStack Query)**
- Data fetching and caching
- Query invalidation
- Optimistic updates

✅ **GraphQL Client**
- `graphql-request` for GraphQL queries
- Singleton client with auth token management
- Endpoint: `http://localhost:4000/graphql`

✅ **Auth System**
- AuthContext with JWT
- Token storage (localStorage)
- Protected routes
- Auto token refresh

✅ **Basic Components**
- Button, Card, Input, Modal, Toast
- Forms (Login, Register, User, AgentConfig)
- Layout (Navbar, Sidebar)
- UI components

✅ **Existing Pages**
- `/` - Home/Landing
- `/login` - Login page
- `/register` - Register page
- `/dashboard` - Dashboard
- `/dashboard/users` - User management
- `/dashboard/configs` - Agent config management

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **State**: React Query + Context API
- **API**: GraphQL (graphql-request) + Axios (REST fallback)
- **UI**: Custom components + shadcn/ui patterns

---

## Frontend Architecture Principles

### 1. Mode-First Design

The UI should clearly distinguish between three modes:

- **Ask Mode**: Chat-like interface, fast responses
- **Plan Mode**: Planning interface, structured plan display
- **Agent Mode**: Execution interface, progress tracking, step-by-step

### 2. Component Composition

Build small, reusable components that compose into larger features:

```
ChatInterface
├── MessageList
│   ├── Message (Ask/Plan/Agent variants)
│   └── MessageActions
├── ChatInput
│   ├── ModeSelector
│   ├── InputField
│   └── SendButton
└── Sidebar
    ├── ConversationList
    └── Settings
```

### 3. State Management Layers

**Layer 1: Server State (React Query)**
- API data
- Caching
- Background refetching

**Layer 2: Client State (Context/State)**
- UI state (modals, sidebars)
- Form state
- Temporary selections

**Layer 3: URL State (Next.js Router)**
- Current mode
- Session ID
- Active conversation

### 4. Real-Time Updates

- **Ask Mode**: Stream response chunks
- **Plan Mode**: Stream plan generation steps
- **Agent Mode**: Stream execution progress

**Strategy**: GraphQL Subscriptions or Server-Sent Events (SSE)

---

## Page Structure

### Main Application Pages

```
/app
├── / (home/landing)
├── /login
├── /register
├── /chat (main chat interface)
│   ├── /chat/[sessionId] (specific conversation)
│   └── /chat/new (new conversation)
├── /dashboard
│   ├── /dashboard (overview)
│   ├── /dashboard/users (user management)
│   ├── /dashboard/configs (agent configs)
│   └── /dashboard/settings (user settings)
└── /history (execution history)
    ├── /history/plans (plan history)
    └── /history/executions (execution history)
```

### Chat Page Structure

```
/chat
├── Layout (with sidebar)
│   ├── Sidebar
│   │   ├── ModeSelector (Ask/Plan/Agent)
│   │   ├── ConversationList
│   │   ├── AgentConfigSelector
│   │   └── Settings
│   └── Main Content
│       ├── ChatHeader (session info, mode indicator)
│       ├── ChatInterface (mode-specific)
│       └── ChatInput (with mode context)
```

---

## Component Architecture

### Core Components

#### 1. ChatInterface (Main Container)

**Purpose**: Main chat interface, mode-agnostic container

**Props:**
```typescript
interface ChatInterfaceProps {
  sessionId: string;
  mode: 'ask' | 'plan' | 'agent';
  configId?: string;
}
```

**Responsibilities:**
- Render mode-specific interface
- Handle message display
- Manage streaming updates
- Handle user input

**Variants:**
- `AskChatInterface` - Simple chat
- `PlanChatInterface` - Plan display
- `AgentChatInterface` - Execution tracking

#### 2. MessageList

**Purpose**: Display conversation messages

**Props:**
```typescript
interface MessageListProps {
  messages: Message[];
  mode: 'ask' | 'plan' | 'agent';
  isStreaming?: boolean;
}
```

**Message Types:**
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  mode?: 'ask' | 'plan' | 'agent';
  metadata?: {
    // Ask mode
    tokensUsed?: number;
    model?: string;
    
    // Plan mode
    plan?: Plan;
    confidence?: number;
    
    // Agent mode
    execution?: Execution;
    stepProgress?: ExecutionStep[];
  };
}
```

#### 3. ChatInput

**Purpose**: Input field with mode awareness

**Props:**
```typescript
interface ChatInputProps {
  mode: 'ask' | 'plan' | 'agent';
  onSubmit: (query: string) => void;
  isProcessing?: boolean;
  placeholder?: string;
}
```

**Features:**
- Mode-specific placeholders
- Keyboard shortcuts
- File attachments (future)
- Code block support

#### 4. ModeSelector

**Purpose**: Switch between Ask/Plan/Agent modes

**Props:**
```typescript
interface ModeSelectorProps {
  currentMode: 'ask' | 'plan' | 'agent';
  onModeChange: (mode: 'ask' | 'plan' | 'agent') => void;
  disabled?: boolean;
}
```

**UI:**
- Tab-like interface
- Mode descriptions
- Visual indicators

#### 5. PlanDisplay (Plan Mode)

**Purpose**: Display structured plans

**Props:**
```typescript
interface PlanDisplayProps {
  plan: Plan;
  onExecute?: () => void; // Convert to Agent mode
  onEdit?: () => void;
}
```

**Features:**
- Step-by-step visualization
- Dependencies graph
- Tool requirements
- Estimated duration
- Execute button (converts to Agent mode)

#### 6. ExecutionTracker (Agent Mode)

**Purpose**: Track execution progress

**Props:**
```typescript
interface ExecutionTrackerProps {
  execution: Execution;
  onCancel?: () => void;
  onRetry?: () => void;
}
```

**Features:**
- Step-by-step progress
- Real-time updates
- Error display
- Results preview
- Cancel/Retry actions

#### 7. StreamingMessage

**Purpose**: Display streaming responses

**Props:**
```typescript
interface StreamingMessageProps {
  content: string;
  isComplete: boolean;
  mode: 'ask' | 'plan' | 'agent';
}
```

**Features:**
- Typewriter effect
- Markdown rendering
- Code syntax highlighting
- Stop streaming button

### Layout Components

#### 1. AppLayout

**Purpose**: Main app layout with sidebar

**Structure:**
```
AppLayout
├── Sidebar
│   ├── Logo
│   ├── Navigation
│   ├── ModeSelector
│   └── UserMenu
└── MainContent
    └── {children}
```

#### 2. Sidebar

**Purpose**: Navigation and mode selection

**Sections:**
- Mode selector (Ask/Plan/Agent)
- Recent conversations
- Agent configs
- Settings link

#### 3. ChatHeader

**Purpose**: Session information and actions

**Shows:**
- Session name/ID
- Current mode indicator
- Active agent config
- Actions (new chat, settings)

### UI Components (Extend Existing)

#### Current Components
- ✅ Button
- ✅ Card
- ✅ Input
- ✅ Modal
- ✅ Toast
- ✅ Spinner
- ✅ Table

#### Additional Components Needed

**CodeBlock**
```typescript
interface CodeBlockProps {
  code: string;
  language?: string;
  showCopy?: boolean;
}
```

**ProgressBar**
```typescript
interface ProgressBarProps {
  progress: number; // 0-100
  steps?: { name: string; status: 'pending' | 'running' | 'completed' | 'failed' }[];
}
```

**StepIndicator**
```typescript
interface StepIndicatorProps {
  steps: PlanStep[];
  currentStep?: number;
  onStepClick?: (step: number) => void;
}
```

**MarkdownRenderer**
```typescript
interface MarkdownRendererProps {
  content: string;
  className?: string;
}
```

---

## State Management Strategy

### React Query Setup

**Query Keys Structure:**
```typescript
const queryKeys = {
  // Conversations
  conversations: ['conversations'] as const,
  conversation: (sessionId: string) => ['conversations', sessionId] as const,
  
  // Executions
  executions: (sessionId: string) => ['executions', sessionId] as const,
  execution: (executionId: string) => ['executions', executionId] as const,
  
  // Plans
  plans: (sessionId: string) => ['plans', sessionId] as const,
  plan: (planId: string) => ['plans', planId] as const,
  
  // Agent Configs
  agentConfigs: ['agentConfigs'] as const,
  agentConfig: (configId: string) => ['agentConfigs', configId] as const,
};
```

### Custom Hooks

#### useChat

**Purpose**: Main chat hook for all modes

```typescript
function useChat(sessionId: string, mode: 'ask' | 'plan' | 'agent') {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Mutations
  const askMutation = useMutation({...});
  const planMutation = useMutation({...});
  const executeMutation = useMutation({...});
  
  // Queries
  const { data: conversation } = useQuery({
    queryKey: queryKeys.conversation(sessionId),
    queryFn: () => fetchConversation(sessionId),
  });
  
  // Actions
  const sendMessage = async (query: string) => {
    // Mode-specific logic
  };
  
  return {
    messages,
    isStreaming,
    sendMessage,
    // ... other methods
  };
}
```

#### useStreaming

**Purpose**: Handle streaming responses

```typescript
function useStreaming(sessionId: string) {
  const [streamContent, setStreamContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const startStream = async (query: string, mode: string) => {
    // Setup streaming connection
    // Update streamContent as chunks arrive
  };
  
  const stopStream = () => {
    // Close streaming connection
  };
  
  return {
    streamContent,
    isStreaming,
    startStream,
    stopStream,
  };
}
```

#### useMode

**Purpose**: Manage current mode state

```typescript
function useMode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const mode = (searchParams.get('mode') || 'ask') as 'ask' | 'plan' | 'agent';
  
  const setMode = (newMode: 'ask' | 'plan' | 'agent') => {
    router.push(`?mode=${newMode}`);
  };
  
  return { mode, setMode };
}
```

#### useAgentConfig

**Purpose**: Manage agent config selection

```typescript
function useAgentConfig() {
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  
  const { data: configs } = useQuery({
    queryKey: queryKeys.agentConfigs,
    queryFn: fetchAgentConfigs,
  });
  
  const selectedConfig = configs?.find(c => c.id === selectedConfigId);
  
  return {
    configs,
    selectedConfig,
    selectedConfigId,
    setSelectedConfigId,
  };
}
```

### Context Providers

#### ChatContext

**Purpose**: Share chat state across components

```typescript
interface ChatContextType {
  sessionId: string;
  mode: 'ask' | 'plan' | 'agent';
  configId: string | null;
  messages: Message[];
  isProcessing: boolean;
  setMode: (mode: 'ask' | 'plan' | 'agent') => void;
  setConfigId: (id: string | null) => void;
  sendMessage: (query: string) => Promise<void>;
}
```

---

## API Integration

### GraphQL Queries

#### Conversations

```graphql
query GetConversation($sessionId: ID!) {
  conversation(sessionId: $sessionId) {
    id
    sessionId
    userId
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
```

#### Ask Mode

```graphql
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
```

#### Plan Mode

```graphql
mutation Plan($query: String!, $sessionId: ID, $configId: ID) {
  plan(query: $query, sessionId: $sessionId, configId: $configId) {
    id
    sessionId
    plan {
      id
      steps {
        id
        order
        description
        tool
        parameters
        dependencies
      }
      estimatedDuration
      requiredTools
    }
    confidence
    timestamp
  }
}
```

#### Agent Mode

```graphql
mutation Execute($query: String!, $sessionId: ID, $configId: ID) {
  execute(query: $query, sessionId: $sessionId, configId: $configId) {
    id
    sessionId
    execution {
      id
      plan {
        id
        steps {
          id
          order
          description
        }
      }
      status
      steps {
        id
        planStepId
        status
        result
        error
        startedAt
        completedAt
      }
      results
      error
      startedAt
      completedAt
    }
    timestamp
  }
}
```

### GraphQL Subscriptions (Streaming)

```graphql
subscription StreamResponse($sessionId: ID!) {
  streamResponse(sessionId: $sessionId) {
    type
    data
    timestamp
  }
}
```

**Subscription Events:**
- `CHUNK` - Text chunk for streaming
- `STEP_STARTED` - Execution step started
- `STEP_COMPLETED` - Execution step completed
- `EXECUTION_COMPLETED` - Full execution completed
- `ERROR` - Error occurred

### GraphQL Client Setup

**Update `src/lib/graphql/client.ts`:**

```typescript
import { GraphQLClient } from 'graphql-request';
import { createClient } from 'graphql-ws'; // For subscriptions

const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';
const wsEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT || 'ws://localhost:4000/graphql';

// HTTP client (existing)
class GraphQLClientSingleton {
  // ... existing code
}

// WebSocket client for subscriptions
class GraphQLWSClient {
  private client: ReturnType<typeof createClient> | null = null;
  
  connect() {
    this.client = createClient({
      url: wsEndpoint,
      connectionParams: () => {
        const token = localStorage.getItem('token');
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    });
  }
  
  subscribe<T>(query: string, variables: any, onData: (data: T) => void) {
    // Subscribe logic
  }
  
  disconnect() {
    this.client?.dispose();
  }
}

export const graphqlWSClient = new GraphQLWSClient();
```

### REST API Fallback (Axios)

**For non-GraphQL endpoints:**

```typescript
// src/lib/api/chat.ts
import api from '@/lib/api';

export const chatApi = {
  // Streaming endpoint (SSE fallback)
  streamAsk: (query: string, sessionId: string, configId?: string) => {
    return api.post('/chat/ask/stream', { query, sessionId, configId });
  },
  
  // ... other endpoints
};
```

---

## Real-Time Updates

### Strategy Options

#### Option 1: GraphQL Subscriptions (Recommended)

**Pros:**
- Unified GraphQL interface
- Real-time updates
- Type-safe

**Cons:**
- Requires WebSocket support
- More complex setup

**Implementation:**
```typescript
// src/hooks/useStreaming.ts
import { useSubscription } from '@apollo/client'; // Or graphql-ws

function useStreaming(sessionId: string) {
  const { data, error } = useSubscription(STREAM_RESPONSE, {
    variables: { sessionId },
  });
  
  // Handle streaming data
}
```

#### Option 2: Server-Sent Events (SSE)

**Pros:**
- Simple HTTP-based
- Works with existing infrastructure
- Easy to implement

**Cons:**
- One-way communication
- Less flexible than WebSockets

**Implementation:**
```typescript
// src/hooks/useSSE.ts
function useSSE(url: string, onMessage: (data: any) => void) {
  useEffect(() => {
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      onMessage(JSON.parse(event.data));
    };
    
    return () => eventSource.close();
  }, [url]);
}
```

#### Option 3: Polling (Fallback)

**Pros:**
- Works everywhere
- Simple to implement

**Cons:**
- Not real-time
- Higher server load

**Implementation:**
```typescript
// Use React Query with short refetch interval
const { data } = useQuery({
  queryKey: ['execution', executionId],
  queryFn: fetchExecution,
  refetchInterval: 1000, // Poll every second
});
```

### Recommended Approach

**Primary**: GraphQL Subscriptions for real-time updates
**Fallback**: SSE for streaming responses
**Last Resort**: Polling for status updates

---

## UI/UX Patterns

### Mode Switching

**Visual Indicators:**
- Tab-like interface at top
- Mode-specific colors/icons
- Smooth transitions

**Behavior:**
- Preserve conversation context
- Show mode-specific UI elements
- Update URL query params

### Message Display

**Ask Mode:**
- Simple message bubbles
- Markdown rendering
- Code syntax highlighting
- Copy code button

**Plan Mode:**
- Plan visualization
- Step-by-step breakdown
- Dependencies graph
- "Execute Plan" button (switches to Agent mode)

**Agent Mode:**
- Execution progress
- Step-by-step tracker
- Real-time updates
- Results display
- Error handling

### Loading States

**Ask Mode:**
- Typing indicator
- Streaming text effect

**Plan Mode:**
- "Thinking..." indicator
- Progress: "Analyzing..." → "Planning..." → "Finalizing..."

**Agent Mode:**
- Step-by-step progress bar
- Current step highlight
- Estimated time remaining

### Error Handling

**Display:**
- Inline error messages
- Retry buttons
- Error details (expandable)
- Suggestions for fixes

**Types:**
- Network errors
- Validation errors
- Execution errors
- Timeout errors

### Responsive Design

**Mobile:**
- Collapsible sidebar
- Full-width chat
- Bottom input bar
- Swipe gestures

**Desktop:**
- Sidebar always visible
- Multi-column layout
- Keyboard shortcuts
- Drag & drop

---

## Implementation Steps

### Phase 1: Foundation (Week 1)

1. **Setup GraphQL Subscriptions**
   - [ ] Install graphql-ws or @apollo/client
   - [ ] Configure WebSocket client
   - [ ] Test subscription connection

2. **Create Core Types**
   - [ ] Extend `src/types/index.ts` with chat types
   - [ ] Add Message, Plan, Execution types
   - [ ] Add mode types

3. **Create Base Components**
   - [ ] ChatInterface (container)
   - [ ] MessageList
   - [ ] Message (with variants)
   - [ ] ChatInput

4. **Setup State Management**
   - [ ] Create useChat hook
   - [ ] Create useMode hook
   - [ ] Create ChatContext
   - [ ] Setup React Query queries

### Phase 2: Ask Mode (Week 2)

1. **Ask Mode UI**
   - [ ] AskChatInterface component
   - [ ] Simple message display
   - [ ] Streaming message component
   - [ ] Markdown renderer

2. **Ask Mode Integration**
   - [ ] GraphQL mutation for ask
   - [ ] Streaming subscription
   - [ ] Error handling
   - [ ] Loading states

3. **Testing**
   - [ ] Test ask flow
   - [ ] Test streaming
   - [ ] Test error cases

### Phase 3: Plan Mode (Week 3)

1. **Plan Mode UI**
   - [ ] PlanChatInterface component
   - [ ] PlanDisplay component
   - [ ] StepIndicator component
   - [ ] Plan visualization

2. **Plan Mode Integration**
   - [ ] GraphQL mutation for plan
   - [ ] Plan data fetching
   - [ ] "Execute Plan" button (mode switch)
   - [ ] Plan history

3. **Testing**
   - [ ] Test plan generation
   - [ ] Test plan display
   - [ ] Test mode switching

### Phase 4: Agent Mode (Week 4)

1. **Agent Mode UI**
   - [ ] AgentChatInterface component
   - [ ] ExecutionTracker component
   - [ ] ProgressBar component
   - [ ] Step-by-step display

2. **Agent Mode Integration**
   - [ ] GraphQL mutation for execute
   - [ ] Real-time progress updates
   - [ ] Execution status tracking
   - [ ] Results display

3. **Testing**
   - [ ] Test execution flow
   - [ ] Test progress updates
   - [ ] Test error handling
   - [ ] Test cancellation

### Phase 5: Polish & Integration (Week 5)

1. **Mode Selector**
   - [ ] ModeSelector component
   - [ ] Mode switching logic
   - [ ] URL state management
   - [ ] Visual indicators

2. **Sidebar & Navigation**
   - [ ] Conversation list
   - [ ] Agent config selector
   - [ ] Settings integration
   - [ ] User menu

3. **History & Persistence**
   - [ ] Conversation history page
   - [ ] Plan history page
   - [ ] Execution history page
   - [ ] Search functionality

4. **Polish**
   - [ ] Animations
   - [ ] Loading states
   - [ ] Error states
   - [ ] Responsive design
   - [ ] Keyboard shortcuts

---

## Open Questions

### 1. Streaming Implementation
- [ ] GraphQL Subscriptions or SSE?
- [ ] How to handle reconnections?
- [ ] Buffer management for slow connections?

**Decision:** TBD

### 2. Conversation Persistence
- [ ] Auto-save conversations?
- [ ] How to handle unsaved changes?
- [ ] Conversation naming strategy?

**Decision:** TBD

### 3. Mode Switching
- [ ] Can user switch modes mid-conversation?
- [ ] What happens to context when switching?
- [ ] Can Plan mode convert to Agent mode?

**Decision:** TBD

### 4. Agent Config Selection
- [ ] Per-conversation or per-mode?
- [ ] Can user change config mid-conversation?
- [ ] Default config per mode?

**Decision:** TBD

### 5. Mobile Experience
- [ ] Native app or PWA?
- [ ] Mobile-specific UI patterns?
- [ ] Offline support?

**Decision:** TBD

### 6. Code Block Handling
- [ ] Syntax highlighting library?
- [ ] Copy to clipboard?
- [ ] Run code button (future)?

**Decision:** TBD

### 7. File Attachments
- [ ] Support file uploads?
- [ ] Which file types?
- [ ] File size limits?

**Decision:** TBD

### 8. Search & Filter
- [ ] Search conversations?
- [ ] Filter by mode?
- [ ] Filter by date?

**Decision:** TBD

---

## Key Decisions Log

### Decision 1: State Management
**Date:** [TBD]
**Decision:** React Query + Context API
**Rationale:** React Query for server state, Context for UI state
**Status:** ✅ Decided

### Decision 2: GraphQL Client
**Date:** [TBD]
**Decision:** graphql-request for queries, graphql-ws for subscriptions
**Rationale:** Lightweight, works well with React Query
**Status:** ✅ Decided

### Decision 3: [TBD]
**Date:** [TBD]
**Decision:** [TBD]
**Rationale:** [TBD]
**Status:** ⏳ Pending

---

## Component Checklist

### Core Components
- [ ] ChatInterface
- [ ] MessageList
- [ ] Message (Ask variant)
- [ ] Message (Plan variant)
- [ ] Message (Agent variant)
- [ ] ChatInput
- [ ] ModeSelector
- [ ] StreamingMessage

### Plan Mode Components
- [ ] PlanDisplay
- [ ] PlanStep
- [ ] StepIndicator
- [ ] DependenciesGraph

### Agent Mode Components
- [ ] ExecutionTracker
- [ ] ProgressBar
- [ ] ExecutionStep
- [ ] ResultsDisplay

### UI Components
- [ ] CodeBlock
- [ ] MarkdownRenderer
- [ ] LoadingSpinner
- [ ] ErrorDisplay
- [ ] EmptyState

### Layout Components
- [ ] AppLayout
- [ ] Sidebar
- [ ] ChatHeader
- [ ] ConversationList

---

## Notes & Ideas

### UI/UX Ideas
- [ ] Dark mode support
- [ ] Customizable themes
- [ ] Keyboard shortcuts (Cmd+K for command palette)
- [ ] Drag & drop files
- [ ] Voice input (future)
- [ ] Collaborative editing (future)
- [ ] Export conversations (PDF, Markdown)
- [ ] Share conversations (with link)

### Performance Optimizations
- [ ] Virtual scrolling for long message lists
- [ ] Lazy load code blocks
- [ ] Image optimization
- [ ] Bundle splitting
- [ ] Service worker for offline

### Accessibility
- [ ] ARIA labels
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Focus management
- [ ] Color contrast

### Analytics & Monitoring
- [ ] User interaction tracking
- [ ] Performance metrics
- [ ] Error tracking
- [ ] Usage analytics

---

## Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [React Query Docs](https://tanstack.com/query/latest)
- [GraphQL Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Cursor UI Reference](https://cursor.sh)

---

**Last Updated:** [Date]
**Version:** 0.1.0

