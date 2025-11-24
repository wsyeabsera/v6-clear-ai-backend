import { v4 as uuidv4 } from 'uuid';
import { Message } from 'shared';
import { ConversationService } from '../services/conversation/ConversationService';
import { KernelAdapter } from '../kernel/KernelAdapter';
import { ThoughtAgent } from '../agents/ThoughtAgent';
import { PlannerAgent } from '../agents/PlannerAgent';
import { ExecutorAgent, Execution } from '../agents/ExecutorAgent';
import { ReflectionAgent } from '../agents/ReflectionAgent';
import { ExecutionResponse, AgentConfig } from '../types';
import { getCurrentTimestamp } from 'shared';

export interface AgentModeHandlerOptions {
  userId: string;
  query: string;
  sessionId?: string;
  configId?: string;
  maxIterations?: number;
}

export class AgentModeHandler {
  private thoughtAgent: ThoughtAgent;
  private plannerAgent: PlannerAgent;
  private executorAgent: ExecutorAgent;
  private reflectionAgent: ReflectionAgent;

  constructor(
    private conversationService: ConversationService,
    private kernelAdapter: KernelAdapter
  ) {
    this.thoughtAgent = new ThoughtAgent();
    this.plannerAgent = new PlannerAgent();
    this.executorAgent = new ExecutorAgent();
    this.reflectionAgent = new ReflectionAgent();
  }

  async handle(options: AgentModeHandlerOptions): Promise<ExecutionResponse> {
    const { userId, query, sessionId, configId, maxIterations = 3 } = options;

    // Validate inputs
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('User ID is required');
    }
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query is required');
    }
    if (query.length > 100000) {
      throw new Error('Query is too long (max 100,000 characters)');
    }

    try {
      // 1. Get/Create Session
      const finalSessionId = await this.conversationService.getOrCreateSession(userId, sessionId);

      // 2. Emit event: query received
      await this.kernelAdapter.eventBus.emit('ai-service.agent.query.received', {
        query,
        configId,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 3. Get Conversation Context
      const context = await this.conversationService.getConversationContext(finalSessionId, userId) || {
        sessionId: finalSessionId,
        messages: [],
      };

      // 4. Get Agent Config
      let agentConfig: AgentConfig;
      try {
        const config = await this.conversationService.getAgentConfig(userId, configId);
        if (!config) {
          throw new Error('Agent config not found');
        }
        agentConfig = config;
      } catch (configError: any) {
        throw new Error(`Failed to fetch agent config: ${configError?.message || 'Unknown error'}`);
      }

      // 5. Generate Thought
      let thought;
      try {
        thought = await this.thoughtAgent.generateThought({
          query,
          context,
          agentConfig,
        });
      } catch (thoughtError: any) {
        throw new Error(`Failed to generate thought: ${thoughtError?.message || 'Unknown error'}`);
      }

      // 6. Emit event: thought completed
      await this.kernelAdapter.eventBus.emit('ai-service.agent.thought.completed', {
        reasoning: thought.reasoning,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 7. Generate Plan
      let plan;
      try {
        plan = await this.plannerAgent.generatePlan({
          query,
          thought,
          context,
          agentConfig,
        });
      } catch (planError: any) {
        throw new Error(`Failed to generate plan: ${planError?.message || 'Unknown error'}`);
      }

      // 8. Emit event: plan completed
      await this.kernelAdapter.eventBus.emit('ai-service.agent.plan.completed', {
        planId: plan.id,
        stepCount: plan.steps.length,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 9. Execute Plan (with iteration support)
      let finalExecution: Execution | null = null;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;

        // 10. Emit event: executor started
        await this.kernelAdapter.eventBus.emit('ai-service.agent.executor.started', {
          planId: plan.id,
          iteration,
        }, {
          sessionId: finalSessionId,
          userId,
        });

        // 11. Execute plan
        const execution = await this.executorAgent.executePlan({
          plan,
          kernelAdapter: this.kernelAdapter,
        });

        // 12. Emit event: executor completed
        await this.kernelAdapter.eventBus.emit('ai-service.agent.executor.completed', {
          executionId: execution.plan.id,
          status: execution.status,
          iteration,
        }, {
          sessionId: finalSessionId,
          userId,
        });

        // 13. Reflect on execution
        const reflection = await this.reflectionAgent.reflect({
          query,
          plan,
          execution,
          context,
          agentConfig,
        });

        // 14. Emit event: reflection completed
        await this.kernelAdapter.eventBus.emit('ai-service.agent.reflection.completed', {
          executionId: execution.plan.id,
          success: reflection.success,
          shouldIterate: reflection.shouldIterate,
          iteration,
        }, {
          sessionId: finalSessionId,
          userId,
        });

        finalExecution = execution;

        // If successful or shouldn't iterate, break
        if (reflection.success || !reflection.shouldIterate) {
          break;
        }

        // If should iterate, update plan based on reflection (simplified - in production, regenerate plan)
        if (reflection.nextSteps && reflection.nextSteps.length > 0) {
          // For now, we'll just continue with the same plan
          // In a more sophisticated implementation, we'd regenerate the plan
          console.log(`🔄 Iteration ${iteration}: Reflecting and continuing...`);
        }
      }

      if (!finalExecution) {
        throw new Error('Execution failed to complete');
      }

      // 15. Save user message
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: query.trim(),
        timestamp: getCurrentTimestamp(),
      };
      await this.conversationService.addMessage(finalSessionId, userMessage, userId);

      // 16. Save execution as assistant message
      const executionMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: JSON.stringify({
          type: 'execution',
          execution: finalExecution,
        }),
        timestamp: getCurrentTimestamp(),
      };
      await this.conversationService.addMessage(finalSessionId, executionMessage, userId);

      // 17. Emit event: execution completed
      await this.kernelAdapter.eventBus.emit('ai-service.agent.execution.completed', {
        executionId: finalExecution.plan.id,
        status: finalExecution.status,
        sessionId: finalSessionId,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 18. Return Execution Response
      return {
        id: finalExecution.plan.id,
        sessionId: finalSessionId,
        execution: finalExecution,
        timestamp: executionMessage.timestamp,
      };
    } catch (error: any) {
      // Emit error event
      try {
        await this.kernelAdapter.eventBus.emit('ai-service.agent.error', {
          error: error?.message || String(error),
          query: query?.substring(0, 100) || 'unknown',
          userId,
        }, {
          sessionId: sessionId || 'unknown',
          userId,
        });
      } catch (eventError) {
        console.warn('⚠️  Failed to emit error event:', eventError);
      }

      // Improve error messages
      if (error instanceof Error) {
        if (error.message.includes('Agent config not found')) {
          throw new Error('Agent configuration not found. Please create or select a valid agent config.');
        }
        throw error;
      }
      throw new Error(`Agent mode error: ${String(error)}`);
    }
  }
}


