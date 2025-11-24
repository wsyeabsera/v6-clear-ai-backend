import { ILLMProvider } from './LLMProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { AgentConfig } from '../../types';

export class LLMProviderFactory {
  private static claudeProvider: ClaudeProvider | null = null;
  private static openAIProvider: OpenAIProvider | null = null;
  private static ollamaProvider: OllamaProvider | null = null;

  static create(model: string): ILLMProvider {
    // Detect provider from model name
    if (model.startsWith('claude-')) {
      if (!this.claudeProvider) {
        this.claudeProvider = new ClaudeProvider();
      }
      return this.claudeProvider;
    }

    if (model.startsWith('gpt-')) {
      if (!this.openAIProvider) {
        this.openAIProvider = new OpenAIProvider();
      }
      return this.openAIProvider;
    }

    // Default to Ollama for any other model or if no match
    if (!this.ollamaProvider) {
      this.ollamaProvider = new OllamaProvider();
    }
    return this.ollamaProvider;
  }

  static createFromConfig(config: AgentConfig): ILLMProvider {
    return this.create(config.model);
  }
}

