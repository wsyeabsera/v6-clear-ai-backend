import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerAgent } from '../PlannerAgent';
import { LLMProviderFactory } from '../../services/llm/LLMProviderFactory';
import { ConversationContext, Tool } from 'shared';
import { AgentConfig, Thought } from '../../types';

// Mock dependencies
vi.mock('../../services/llm/LLMProviderFactory');

describe('PlannerAgent', () => {
  let plannerAgent: PlannerAgent;
  let mockLLMProvider: any;

  const createMockTools = (): Tool[] => [
    {
      name: 'search_web',
      description: 'Search the web',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockLLMProvider = {
      generateResponse: vi.fn(),
    };

    vi.mocked(LLMProviderFactory.createFromConfig).mockReturnValue(mockLLMProvider);

    plannerAgent = new PlannerAgent();
  });

  describe('generatePlan', () => {
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

    const createMockThought = (): Thought => ({
      reasoning: 'Need to search and read',
      considerations: ['Use available tools'],
      assumptions: ['Tools are available'],
    });

    const createMockContext = (): ConversationContext => ({
      sessionId: 'session-123',
      messages: [],
    });

    it('should include available tools in prompt', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Search for info',
              tool: 'search_web',
              parameters: { query: 'test' },
              dependencies: [],
            },
          ],
          confidence: 0.8,
          requiredTools: ['search_web'],
          reasoning: 'Use search tool',
        }),
      });

      await plannerAgent.generatePlan({
        query: 'Find information',
        thought,
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('Available Tools (ONLY use these tools)'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('search_web: Search the web'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        expect.stringContaining('read_file: Read a file'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should warn about no tools when none available', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Manual step',
              dependencies: [],
            },
          ],
          confidence: 0.6,
          requiredTools: [],
          reasoning: 'Manual only',
        }),
      });

      await plannerAgent.generatePlan({
        query: 'Do something',
        thought,
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

    it('should filter out invalid tool references', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Valid step',
              tool: 'search_web',
              parameters: { query: 'test' },
              dependencies: [],
            },
            {
              order: 2,
              description: 'Invalid tool step',
              tool: 'invalid_tool',
              parameters: { foo: 'bar' },
              dependencies: [],
            },
          ],
          confidence: 0.8,
          requiredTools: ['search_web', 'invalid_tool'],
          reasoning: 'Mixed tools',
        }),
      });

      const plan = await plannerAgent.generatePlan({
        query: 'Do tasks',
        thought,
        context,
        agentConfig,
        availableTools: tools,
      });

      // First step should have tool
      expect(plan.steps[0].tool).toBe('search_web');
      expect(plan.steps[0].parameters).toBeDefined();

      // Second step should be converted to manual (no tool)
      expect(plan.steps[1].tool).toBeUndefined();
      expect(plan.steps[1].parameters).toBeUndefined();

      // Required tools should only include valid ones
      expect(plan.requiredTools).toEqual(['search_web']);
      expect(plan.requiredTools).not.toContain('invalid_tool');
    });

    it('should normalize requiredTools to only include valid tools', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Use search',
              tool: 'search_web',
              parameters: { query: 'test' },
              dependencies: [],
            },
          ],
          confidence: 0.8,
          requiredTools: ['search_web', 'read_file'],
          reasoning: 'Use tools',
        }),
      });

      const plan = await plannerAgent.generatePlan({
        query: 'Search',
        thought,
        context,
        agentConfig,
        availableTools: tools,
      });

      // Should only include tools actually used in steps
      expect(plan.requiredTools).toEqual(['search_web']);
      expect(plan.requiredTools).not.toContain('read_file');
    });

    it('should handle empty tool list in plan', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();
      const tools = createMockTools();

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Manual step',
              dependencies: [],
            },
          ],
          confidence: 0.7,
          reasoning: 'Manual work',
        }),
      });

      const plan = await plannerAgent.generatePlan({
        query: 'Manual task',
        thought,
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(plan.requiredTools).toEqual([]);
      expect(plan.steps[0].tool).toBeUndefined();
    });

    it('should preserve valid tool parameters', async () => {
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const context = createMockContext();
      const tools = createMockTools();

      const testParams = { query: 'test search', limit: 10 };

      mockLLMProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          steps: [
            {
              order: 1,
              description: 'Search',
              tool: 'search_web',
              parameters: testParams,
              dependencies: [],
            },
          ],
          confidence: 0.9,
          requiredTools: ['search_web'],
          reasoning: 'Search',
        }),
      });

      const plan = await plannerAgent.generatePlan({
        query: 'Search',
        thought,
        context,
        agentConfig,
        availableTools: tools,
      });

      expect(plan.steps[0].parameters).toEqual(testParams);
    });
  });
});

