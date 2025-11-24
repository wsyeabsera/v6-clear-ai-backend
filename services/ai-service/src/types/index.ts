import { ConversationContext, Message } from 'shared';

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  updatedAt?: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  model: string;
  finishReason?: string;
}

export interface AskResponse {
  id: string;
  sessionId: string;
  response: string;
  tokensUsed?: number;
  model: string;
  timestamp: string;
}

export interface Conversation {
  sessionId: string;
  messages: Message[];
  createdAt: string;
  updatedAt?: string;
}

export interface PlanStep {
  id: string;
  order: number;
  description: string;
  tool?: string;
  parameters?: Record<string, any>;
  dependencies: number[];
}

export interface Plan {
  id: string;
  steps: PlanStep[];
  estimatedDuration?: number;
  requiredTools: string[];
  confidence: number;
  reasoning?: string;
}

export interface PlanResponse {
  id: string;
  sessionId: string;
  plan: Plan;
  confidence: number;
  timestamp: string;
}

export interface ExecutionStep {
  planStepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Execution {
  id: string;
  plan: Plan;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: ExecutionStep[];
  results?: any;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ExecutionResponse {
  id: string;
  sessionId: string;
  execution: Execution;
  timestamp: string;
}

export interface Reflection {
  success: boolean;
  analysis: string;
  issues: string[];
  improvements: string[];
  shouldIterate: boolean;
  nextSteps?: string[];
}

export interface Thought {
  reasoning: string;
  considerations: string[];
  assumptions: string[];
}

export { ConversationContext, Message };

