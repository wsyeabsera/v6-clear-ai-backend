import { ConversationContext } from 'shared';
import { AgentConfig, LLMResponse } from '../../types';

export interface LLMProviderOptions {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ILLMProvider {
  generateResponse(
    prompt: string,
    context: ConversationContext,
    config: AgentConfig,
    options?: LLMProviderOptions
  ): Promise<LLMResponse>;
}

