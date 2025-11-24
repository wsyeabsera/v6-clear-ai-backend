import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanModeHandler } from '../PlanModeHandler';
import { ConversationService } from '../../services/conversation/ConversationService';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ThoughtAgent } from '../../agents/ThoughtAgent';
import { PlannerAgent } from '../../agents/PlannerAgent';
import { ConversationContext, Tool } from 'shared';
import { Plan, Thought } from '../../types';

// Mock dependencies
vi.mock('../../services/conversation/ConversationService');
vi.mock('../../kernel/KernelAdapter');
vi.mock('../../agents/ThoughtAgent');
vi.mock('../../agents/PlannerAgent');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid'),
}));

describe('PlanModeHandler', () => {
  let planModeHandler: PlanModeHandler;
  let mockConversationService: any;
  let mockKernelAdapter: any;
  let mockEventBus: any;
  let mockToolRegistry: any;
  let mockThoughtAgent: any;
  let mockPlannerAgent: any;

  const createMockTools = (): Tool[] => [
    {
      name: 'search_web',
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_file',
      description: 'Read a file from the filesystem',
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

    // Mock Event Bus
    mockEventBus = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    // Mock Tool Registry
    mockToolRegistry = {
      discoverTools: vi.fn().mockResolvedValue(createMockTools()),
      validateTool: vi.fn().mockResolvedValue({ valid: true }),
      executeTool: vi.fn().mockResolvedValue({ success: true, data: {} }),
    };

    // Mock KernelAdapter
    mockKernelAdapter = {
      eventBus: mockEventBus,
      toolRegistry: mockToolRegistry,
      contextManager: {
        getContext: vi.fn(),
        saveContext: vi.fn(),
      },
    };
    (KernelAdapter as any).mockImplementation(() => mockKernelAdapter);

    // Mock ConversationService
    mockConversationService = {
      getOrCreateSession: vi.fn(),
      getConversationContext: vi.fn(),
      getAgentConfig: vi.fn(),
      addMessage: vi.fn(),
    };
    (ConversationService as any).mockImplementation(() => mockConversationService);

    // Mock ThoughtAgent
    mockThoughtAgent = {
      generateThought: vi.fn(),
    };
    (ThoughtAgent as any).mockImplementation(() => mockThoughtAgent);

    // Mock PlannerAgent
    mockPlannerAgent = {
      generatePlan: vi.fn(),
    };
    (PlannerAgent as any).mockImplementation(() => mockPlannerAgent);

    planModeHandler = new PlanModeHandler(mockConversationService, mockKernelAdapter);
  });

  describe('handle', () => {
    const createTestOptions = (overrides: any = {}) => ({
      userId: 'user-123',
      query: 'Create a web scraper',
      sessionId: 'session-456',
      configId: 'config-789',
      ...overrides,
    });

    const createMockAgentConfig = () => ({
      id: 'config-789',
      userId: 'user-123',
      name: 'Test Config',
      prompt: 'You are helpful',
      model: 'llama2',
      temperature: 0.7,
      maxTokens: 1024,
      createdAt: new Date().toISOString(),
    });

    const createMockThought = (): Thought => ({
      reasoning: 'Need to search for web scraping libraries',
      considerations: ['Python vs JavaScript', 'Rate limiting'],
      assumptions: ['User wants Python'],
    });

    const createMockPlan = (): Plan => ({
      id: 'plan-123',
      steps: [
        {
          id: 'step-1',
          order: 1,
          description: 'Search for web scraping libraries',
          tool: 'search_web',
          parameters: { query: 'python web scraping', limit: 5 },
          dependencies: [],
        },
        {
          id: 'step-2',
          order: 2,
          description: 'Read documentation',
          tool: 'read_file',
          parameters: { path: '/docs/scraping.md' },
          dependencies: [1],
        },
      ],
      requiredTools: ['search_web', 'read_file'],
      confidence: 0.85,
      reasoning: 'Standard web scraping workflow',
    });

    it('should discover tools from kernel registry', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      await planModeHandler.handle(options);

      expect(mockToolRegistry.discoverTools).toHaveBeenCalledWith('', 100);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.plan.tools.discovered',
        expect.objectContaining({
          toolCount: 2,
          toolNames: ['search_web', 'read_file'],
        }),
        expect.any(Object)
      );
    });

    it('should pass available tools to ThoughtAgent', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };
      const tools = createMockTools();

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockToolRegistry.discoverTools.mockResolvedValue(tools);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      await planModeHandler.handle(options);

      expect(mockThoughtAgent.generateThought).toHaveBeenCalledWith(
        expect.objectContaining({
          query: options.query,
          context,
          agentConfig,
          availableTools: tools,
        })
      );
    });

    it('should pass available tools to PlannerAgent', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };
      const tools = createMockTools();

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockToolRegistry.discoverTools.mockResolvedValue(tools);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      await planModeHandler.handle(options);

      expect(mockPlannerAgent.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          query: options.query,
          thought,
          context,
          agentConfig,
          availableTools: tools,
        })
      );
    });

    it('should validate plan tools after generation', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      await planModeHandler.handle(options);

      expect(mockToolRegistry.validateTool).toHaveBeenCalledWith(
        'search_web',
        { query: 'python web scraping', limit: 5 }
      );
      expect(mockToolRegistry.validateTool).toHaveBeenCalledWith(
        'read_file',
        { path: '/docs/scraping.md' }
      );
    });

    it('should emit validation warnings for invalid tools', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      // Make validation fail for one tool
      mockToolRegistry.validateTool
        .mockResolvedValueOnce({ valid: true })
        .mockResolvedValueOnce({
          valid: false,
          errors: ['Missing required parameter: path'],
        });

      await planModeHandler.handle(options);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.plan.validation.warnings',
        expect.objectContaining({
          planId: plan.id,
          warnings: expect.arrayContaining([
            expect.stringContaining('Step 2 tool "read_file" validation failed'),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle no tools available gracefully', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan: Plan = {
        id: 'plan-123',
        steps: [
          {
            id: 'step-1',
            order: 1,
            description: 'Manual step - research libraries',
            dependencies: [],
          },
        ],
        requiredTools: [],
        confidence: 0.7,
        reasoning: 'No tools available, manual steps only',
      };
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockToolRegistry.discoverTools.mockResolvedValue([]);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      const result = await planModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(result.plan.requiredTools).toEqual([]);
      expect(mockThoughtAgent.generateThought).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: [],
        })
      );
    });

    it('should continue if tool discovery fails', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan: Plan = {
        id: 'plan-123',
        steps: [
          {
            id: 'step-1',
            order: 1,
            description: 'Manual step',
            dependencies: [],
          },
        ],
        requiredTools: [],
        confidence: 0.7,
      };
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockToolRegistry.discoverTools.mockRejectedValue(new Error('Registry error'));
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      const result = await planModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(mockThoughtAgent.generateThought).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: [],
        })
      );
    });

    it('should emit plan generated event with validation info', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);

      await planModeHandler.handle(options);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.plan.plan.generated',
        expect.objectContaining({
          planId: plan.id,
          stepCount: 2,
          confidence: 0.85,
          requiredTools: ['search_web', 'read_file'],
          validationWarnings: 0,
        }),
        expect.any(Object)
      );
    });
  });
});

