import { v4 as uuidv4 } from 'uuid';
import { Message } from 'shared';
import { ConversationService } from '../services/conversation/ConversationService';
import { KernelAdapter } from '../kernel/KernelAdapter';
import { ThoughtAgent } from '../agents/ThoughtAgent';
import { PlannerAgent } from '../agents/PlannerAgent';
import { PlanResponse, AgentConfig } from '../types';
import { getCurrentTimestamp } from 'shared';

export interface PlanModeHandlerOptions {
  userId: string;
  query: string;
  sessionId?: string;
  configId?: string;
}

export class PlanModeHandler {
  private thoughtAgent: ThoughtAgent;
  private plannerAgent: PlannerAgent;

  constructor(
    private conversationService: ConversationService,
    private kernelAdapter: KernelAdapter
  ) {
    this.thoughtAgent = new ThoughtAgent();
    this.plannerAgent = new PlannerAgent();
  }

  async handle(options: PlanModeHandlerOptions): Promise<PlanResponse> {
    const { userId, query, sessionId, configId } = options;

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
      await this.kernelAdapter.eventBus.emit('ai-service.plan.query.received', {
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

      // 5. Generate Thought (reasoning phase)
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
      await this.kernelAdapter.eventBus.emit('ai-service.plan.thought.completed', {
        reasoning: thought.reasoning,
        considerations: thought.considerations,
        assumptions: thought.assumptions,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 7. Generate Plan (planning phase)
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

      // 8. Emit event: plan generated
      await this.kernelAdapter.eventBus.emit('ai-service.plan.plan.generated', {
        planId: plan.id,
        stepCount: plan.steps.length,
        confidence: plan.confidence,
        requiredTools: plan.requiredTools,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 9. Save user message to conversation
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: query.trim(),
        timestamp: getCurrentTimestamp(),
      };
      await this.conversationService.addMessage(finalSessionId, userMessage, userId);

      // 10. Save plan as assistant message (store plan JSON)
      const planMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: JSON.stringify({
          type: 'plan',
          plan: plan,
        }),
        timestamp: getCurrentTimestamp(),
      };
      await this.conversationService.addMessage(finalSessionId, planMessage, userId);

      // 11. Emit event: plan completed
      await this.kernelAdapter.eventBus.emit('ai-service.plan.completed', {
        planId: plan.id,
        sessionId: finalSessionId,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 12. Return Plan Response
      return {
        id: plan.id,
        sessionId: finalSessionId,
        plan,
        confidence: plan.confidence,
        timestamp: planMessage.timestamp,
      };
    } catch (error: any) {
      // Emit error event
      try {
        await this.kernelAdapter.eventBus.emit('ai-service.plan.error', {
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
      throw new Error(`Plan mode error: ${String(error)}`);
    }
  }
}


