import OpenAI from 'openai';
import { ConversationContext, Message } from 'shared';
import { ILLMProvider, LLMProviderOptions } from './LLMProvider';
import { AgentConfig, LLMResponse } from '../../types';

export class OpenAIProvider implements ILLMProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(
    prompt: string,
    context: ConversationContext,
    config: AgentConfig,
    options?: LLMProviderOptions
  ): Promise<LLMResponse> {
    try {
      // Build messages array from context
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = context.messages.map(
        (msg: Message) => ({
          role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system',
          content: msg.content,
        })
      );

      // Add the current prompt as a user message
      messages.push({
        role: 'user',
        content: prompt,
      });

      // Build system prompt from config
      const systemPrompt = config.prompt || 'You are a helpful AI assistant.';
      
      // Add system message at the beginning if not already present
      if (!messages.some((msg) => msg.role === 'system')) {
        messages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }

      const response = await this.client.chat.completions.create({
        model: config.model || 'gpt-4-turbo-preview',
        max_tokens: options?.maxTokens || config.maxTokens || 1024,
        temperature: options?.temperature ?? config.temperature ?? 0.7,
        messages: messages,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      const content = choice.message.content || '';

      // Calculate tokens used
      const tokensUsed = response.usage
        ? response.usage.prompt_tokens + response.usage.completion_tokens
        : undefined;

      return {
        content,
        tokensUsed,
        model: config.model,
        finishReason: choice.finish_reason || undefined,
      };
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
    }
  }
}

