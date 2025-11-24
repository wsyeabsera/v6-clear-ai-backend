import axios, { AxiosInstance } from 'axios';
import { ConversationContext, Message } from 'shared';
import { ILLMProvider, LLMProviderOptions } from './LLMProvider';
import { AgentConfig, LLMResponse } from '../../types';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  context?: number[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider implements ILLMProvider {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 second timeout for Ollama
    });
  }

  async generateResponse(
    prompt: string,
    context: ConversationContext,
    config: AgentConfig,
    options?: LLMProviderOptions
  ): Promise<LLMResponse> {
    try {
      // Build conversation history for Ollama
      // Ollama expects a single prompt string, so we'll combine the context
      const conversationHistory = context.messages
        .map((msg: Message) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      // Combine history with current prompt
      const fullPrompt = conversationHistory
        ? `${conversationHistory}\n\nUser: ${prompt}\n\nAssistant:`
        : `User: ${prompt}\n\nAssistant:`;

      // Build system prompt from config
      const systemPrompt = config.prompt || 'You are a helpful AI assistant.';

      const request: OllamaGenerateRequest = {
        model: config.model || 'llama2',
        prompt: fullPrompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? config.temperature ?? 0.7,
          num_predict: options?.maxTokens || config.maxTokens || 1024,
        },
      };

      const response = await this.client.post<OllamaGenerateResponse>('/api/generate', request);

      if (!response.data || !response.data.response) {
        throw new Error('Invalid response from Ollama');
      }

      // Ollama doesn't provide token counts in the same way, but we can estimate
      // using prompt_eval_count and eval_count if available
      const tokensUsed = response.data.prompt_eval_count && response.data.eval_count
        ? response.data.prompt_eval_count + response.data.eval_count
        : undefined;

      return {
        content: response.data.response,
        tokensUsed,
        model: config.model,
        finishReason: response.data.done ? 'stop' : undefined,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new Error(
            `Failed to connect to Ollama at ${this.baseUrl}. Make sure Ollama is running and the model "${config.model}" is available.`
          );
        }
        throw new Error(`Ollama API error: ${error.message}`);
      }
      throw error;
    }
  }
}

