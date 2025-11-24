import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProviderFactory } from '../LLMProviderFactory';
import { ClaudeProvider } from '../ClaudeProvider';
import { OpenAIProvider } from '../OpenAIProvider';
import { OllamaProvider } from '../OllamaProvider';
import { AgentConfig } from '../../../types';

// Mock providers
vi.mock('../ClaudeProvider');
vi.mock('../OpenAIProvider');
vi.mock('../OllamaProvider');

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear static instances
    (LLMProviderFactory as any).claudeProvider = null;
    (LLMProviderFactory as any).openAIProvider = null;
    (LLMProviderFactory as any).ollamaProvider = null;
  });

  const createTestConfig = (model: string): AgentConfig => ({
    id: 'test-config',
    userId: 'test-user',
    name: 'Test Config',
    prompt: 'You are helpful',
    model,
    temperature: 0.7,
    maxTokens: 1024,
    createdAt: new Date().toISOString(),
  });

  describe('create', () => {
    it('should return ClaudeProvider for claude- models', () => {
      const mockClaudeProvider = { generateResponse: vi.fn() };
      (ClaudeProvider as any).mockImplementation(() => mockClaudeProvider);

      const provider = LLMProviderFactory.create('claude-3-sonnet-20240229');

      expect(provider).toBe(mockClaudeProvider);
      expect(ClaudeProvider).toHaveBeenCalledTimes(1);
    });

    it('should return same ClaudeProvider instance on subsequent calls', () => {
      const mockClaudeProvider = { generateResponse: vi.fn() };
      (ClaudeProvider as any).mockImplementation(() => mockClaudeProvider);

      const provider1 = LLMProviderFactory.create('claude-3-sonnet-20240229');
      const provider2 = LLMProviderFactory.create('claude-3-opus-20240229');

      expect(provider1).toBe(provider2);
      expect(ClaudeProvider).toHaveBeenCalledTimes(1);
    });

    it('should return OpenAIProvider for gpt- models', () => {
      const mockOpenAIProvider = { generateResponse: vi.fn() };
      (OpenAIProvider as any).mockImplementation(() => mockOpenAIProvider);

      const provider = LLMProviderFactory.create('gpt-4-turbo-preview');

      expect(provider).toBe(mockOpenAIProvider);
      expect(OpenAIProvider).toHaveBeenCalledTimes(1);
    });

    it('should return same OpenAIProvider instance on subsequent calls', () => {
      const mockOpenAIProvider = { generateResponse: vi.fn() };
      (OpenAIProvider as any).mockImplementation(() => mockOpenAIProvider);

      const provider1 = LLMProviderFactory.create('gpt-4-turbo-preview');
      const provider2 = LLMProviderFactory.create('gpt-3.5-turbo');

      expect(provider1).toBe(provider2);
      expect(OpenAIProvider).toHaveBeenCalledTimes(1);
    });

    it('should return OllamaProvider for other models', () => {
      const mockOllamaProvider = { generateResponse: vi.fn() };
      (OllamaProvider as any).mockImplementation(() => mockOllamaProvider);

      const provider = LLMProviderFactory.create('llama2');

      expect(provider).toBe(mockOllamaProvider);
      expect(OllamaProvider).toHaveBeenCalledTimes(1);
    });

    it('should return OllamaProvider as default', () => {
      const mockOllamaProvider = { generateResponse: vi.fn() };
      (OllamaProvider as any).mockImplementation(() => mockOllamaProvider);

      const provider = LLMProviderFactory.create('custom-model');

      expect(provider).toBe(mockOllamaProvider);
      expect(OllamaProvider).toHaveBeenCalledTimes(1);
    });

    it('should return same OllamaProvider instance on subsequent calls', () => {
      const mockOllamaProvider = { generateResponse: vi.fn() };
      (OllamaProvider as any).mockImplementation(() => mockOllamaProvider);

      const provider1 = LLMProviderFactory.create('llama2');
      const provider2 = LLMProviderFactory.create('mistral');

      expect(provider1).toBe(provider2);
      expect(OllamaProvider).toHaveBeenCalledTimes(1);
    });

    it('should handle empty model name', () => {
      const mockOllamaProvider = { generateResponse: vi.fn() };
      (OllamaProvider as any).mockImplementation(() => mockOllamaProvider);

      const provider = LLMProviderFactory.create('');

      expect(provider).toBe(mockOllamaProvider);
    });
  });

  describe('createFromConfig', () => {
    it('should create provider from config with claude model', () => {
      const mockClaudeProvider = { generateResponse: vi.fn() };
      (ClaudeProvider as any).mockImplementation(() => mockClaudeProvider);

      const config = createTestConfig('claude-3-sonnet-20240229');
      const provider = LLMProviderFactory.createFromConfig(config);

      expect(provider).toBe(mockClaudeProvider);
    });

    it('should create provider from config with gpt model', () => {
      const mockOpenAIProvider = { generateResponse: vi.fn() };
      (OpenAIProvider as any).mockImplementation(() => mockOpenAIProvider);

      const config = createTestConfig('gpt-4-turbo-preview');
      const provider = LLMProviderFactory.createFromConfig(config);

      expect(provider).toBe(mockOpenAIProvider);
    });

    it('should create provider from config with ollama model', () => {
      const mockOllamaProvider = { generateResponse: vi.fn() };
      (OllamaProvider as any).mockImplementation(() => mockOllamaProvider);

      const config = createTestConfig('llama2');
      const provider = LLMProviderFactory.createFromConfig(config);

      expect(provider).toBe(mockOllamaProvider);
    });
  });
});

