import { v4 as uuidv4 } from 'uuid';
import { Message } from 'shared';
import { ConversationService } from '../services/conversation/ConversationService';
import { KernelAdapter } from '../kernel/KernelAdapter';
import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AskResponse } from '../types';
import { getCurrentTimestamp } from 'shared';

export interface AskModeHandlerOptions {
  userId: string;
  query: string;
  sessionId?: string;
  configId?: string;
}

export class AskModeHandler {
  constructor(
    private conversationService: ConversationService,
    private kernelAdapter: KernelAdapter
  ) {}

  async handle(options: AskModeHandlerOptions): Promise<AskResponse> {
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
      await this.kernelAdapter.eventBus.emit('ai-service.ask.query.received', {
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

      // 4. Get User Preferences (placeholder)
      await this.conversationService.getUserPreferences(userId);

      // 5. Get Agent Config
      let agentConfig;
      try {
        agentConfig = await this.conversationService.getAgentConfig(userId, configId);
      } catch (configError: any) {
        throw new Error(`Failed to fetch agent config: ${configError?.message || 'Unknown error'}`);
      }
      
      if (!agentConfig) {
        throw new Error('Agent config not found');
      }

      // Validate agent config
      if (!agentConfig.model || agentConfig.model.trim().length === 0) {
        throw new Error('Agent config has invalid model');
      }

      // 6. Build LLM Prompt (query + context + history)
      // The prompt is just the query - context and history are passed separately

      // 7. Call LLM Provider
      let llmResponse;
      try {
        const provider = LLMProviderFactory.createFromConfig(agentConfig);
        llmResponse = await provider.generateResponse(
          query,
          context,
          agentConfig
        );
      } catch (llmError: any) {
        // Improve LLM error messages
        const errorMessage = llmError?.message || String(llmError);
        if (errorMessage.includes('timeout')) {
          throw new Error('Request timed out. The query may be too complex or the service is busy.');
        }
        if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (errorMessage.includes('invalid') || errorMessage.includes('model')) {
          throw new Error(`Invalid model configuration: ${agentConfig.model}`);
        }
        throw new Error(`LLM provider error: ${errorMessage}`);
      }

      // Validate response
      if (!llmResponse || !llmResponse.content) {
        throw new Error('Received empty response from AI service');
      }

      // 8. Emit event: response generated
      await this.kernelAdapter.eventBus.emit('ai-service.ask.response.generated', {
        query,
        response: llmResponse.content,
        tokensUsed: llmResponse.tokensUsed,
        model: llmResponse.model,
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

      // 10. Save assistant response to conversation
      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: llmResponse.content || '',
        timestamp: getCurrentTimestamp(),
      };
      await this.conversationService.addMessage(finalSessionId, assistantMessage, userId);

      // 11. Emit event: response sent
      await this.kernelAdapter.eventBus.emit('ai-service.ask.response.sent', {
        sessionId: finalSessionId,
        responseId: assistantMessage.id,
      }, {
        sessionId: finalSessionId,
        userId,
      });

      // 12. Return Response
      return {
        id: assistantMessage.id,
        sessionId: finalSessionId,
        response: llmResponse.content,
        tokensUsed: llmResponse.tokensUsed,
        model: llmResponse.model,
        timestamp: assistantMessage.timestamp,
      };
    } catch (error: any) {
      // Emit error event
      try {
        await this.kernelAdapter.eventBus.emit('ai-service.ask.error', {
          error: error?.message || String(error),
          query: query?.substring(0, 100) || 'unknown',
          userId,
          errorType: error?.name || 'UnknownError',
        }, {
          sessionId: sessionId || 'unknown',
          userId,
        });
      } catch (eventError) {
        // Ignore event bus errors - don't let them mask the original error
        console.warn('⚠️  Failed to emit error event:', eventError);
      }

      // Improve error messages for common cases
      if (error instanceof Error) {
        // Check for specific error types
        if (error.message.includes('Agent config not found')) {
          throw new Error('Agent configuration not found. Please create or select a valid agent config.');
        }
        if (error.message.includes('connection') || error.message.includes('timeout')) {
          throw new Error('Failed to connect to AI service. Please try again.');
        }
        if (error.message.includes('API') || error.message.includes('rate limit')) {
          throw new Error('AI service temporarily unavailable. Please try again later.');
        }
        // Re-throw with original error
        throw error;
      }
      throw new Error(`Ask mode error: ${String(error)}`);
    }
  }
}

