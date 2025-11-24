import Anthropic from '@anthropic-ai/sdk';
import { ConversationContext, Message } from 'shared';
import { ILLMProvider, LLMProviderOptions } from './LLMProvider';
import { AgentConfig, LLMResponse } from '../../types';

export class ClaudeProvider implements ILLMProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(
    prompt: string,
    context: ConversationContext,
    config: AgentConfig,
    options?: LLMProviderOptions
  ): Promise<LLMResponse> {
    try {
      // Build messages array from context
      const messages: Anthropic.MessageParam[] = context.messages.map((msg: Message) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      // Add the current prompt as a user message
      messages.push({
        role: 'user',
        content: prompt,
      });

      // Build system prompt from config
      const systemPrompt = config.prompt || 'You are a helpful AI assistant.';

      const response = await this.client.messages.create({
        model: config.model || 'claude-3-sonnet-20240229',
        max_tokens: options?.maxTokens || config.maxTokens || 1024,
        temperature: options?.temperature ?? config.temperature ?? 0.7,
        system: systemPrompt,
        messages: messages,
      });

      // Extract content from response
      const content = response.content
        .map((block) => {
          if (block.type === 'text') {
            return block.text;
          }
          return '';
        })
        .join('');

      // Calculate tokens used (input + output)
      const tokensUsed = response.usage
        ? response.usage.input_tokens + response.usage.output_tokens
        : undefined;

      return {
        content,
        tokensUsed,
        model: config.model,
        finishReason: response.stop_reason || undefined,
      };
    } catch (error: any) {
      throw new Error(`Claude API error: ${error.message || 'Unknown error'}`);
    }
  }
}

