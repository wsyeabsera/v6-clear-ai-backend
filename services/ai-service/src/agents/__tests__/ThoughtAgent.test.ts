import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThoughtAgent } from '../ThoughtAgent';
import { LLMProviderFactory } from '../../services/llm/LLMProviderFactory';
import { ConversationContext, Tool } from 'shared';
import { AgentConfig } from '../../types';

// Mock dependencies
vi.mock('../../services/llm/LLMProviderFactory');

describe('ThoughtAgent', () => {
  let thoughtAgent: ThoughtAgent;
  let mockLLMProvider: any;

  const createMockTools = (): Tool[] => [
    {
      name: 'calculator',
      description: 'Perform calculations',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
        },
        required: ['expression'],
      },
    },
    {
      name: 'web_search',
      description: 'Search the internet',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockLLMProvider = {
      generateResponse: vi.fn(),
    };

    vi.mocked(LLMProviderFactory.createFromConfig).mockReturnValue(mockLLMProvider);

    thoughtAgent = new ThoughtAgent();
  });

  describe('generateThought', () => {
    const createMockAgentConfig = (): AgentConfig => ({
      id: 'config-123',
      userId: 'user-123',
      name: 'Test Config',
      prompt: 'You are helpful',
      model: 'llama2',
      temperature: 0.7,
      maxTokens: 1024,
      createdAt: new Date().toISOString(),
    });

    const createMockContext = (): ConversationContext => ({
      sessionId: 'session-123',
      messages: [],
    });

    it('should include available tools in prompt', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          reasoning: 'Can use calculator for math',
          considerations: ['Tool availability'],
          assumptions: ['Calculator works'],
        }),
      });

      await thoughtAgent.generateThought({
        query: 'Calculate something',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Available Tools:'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('calculator: Perform calculations'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('web_search: Search the internet'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should show required and optional parameters for tools', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          reasoning: 'Analyzing tools',
          considerations: [],
          assumptions: [],
        }),
      });

      await thoughtAgent.generateThought({
        query: 'Use tools',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Required parameters: expression'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Optional parameters: limit'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should warn about no tools when none available', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          reasoning: 'No tools available, manual work needed',
          considerations: ['Manual execution required'],
          assumptions: [],
        }),
      });

      await thoughtAgent.generateThought({
        query: 'Do something',
        context,
        agentConfig,
        availableTools: [],
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('No tools are currently available'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should mention tool availability in considerations prompt', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          reasoning: 'Task analysis',
          considerations: ['Tool constraints'],
          assumptions: [],
        }),
      });

      await thoughtAgent.generateThought({
        query: 'Complex task',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('(including tool availability)'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle tools with no required parameters', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools: Tool[] = [
        {
          name: 'simple_tool',
          description: 'A simple tool',
          inputSchema: {
            type: 'object',
            properties: {
              optional_param: { type: 'string' },
            },
            required: [],
          },
        },
      ];

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          reasoning: 'Use simple tool',
          considerations: [],
          assumptions: [],
        }),
      });

      await thoughtAgent.generateThought({
        query: 'Use simple tool',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Required parameters: none'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should parse JSON thought response correctly', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools = createMockTools();

      const expectedThought = {
        reasoning: 'Detailed reasoning here',
        considerations: ['Consider A', 'Consider B'],
        assumptions: ['Assume X', 'Assume Y'],
      };

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify(expectedThought),
      });

      const result = await thoughtAgent.generateThought({
        query: 'Test query',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(result).toEqual(expectedThought);
    });

    it('should handle non-JSON response gracefully', async () => {
      const agentConfig = createMockAgentConfig();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: 'This is plain text reasoning, not JSON',
      });

      const result = await thoughtAgent.generateThought({
        query: 'Test query',
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(result.reasoning).toBe('This is plain text reasoning, not JSON');
      expect(result.considerations).toEqual([]);
      expect(result.assumptions).toEqual([]);
    });
  });
});

