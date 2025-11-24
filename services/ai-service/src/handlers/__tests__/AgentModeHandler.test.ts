import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentModeHandler } from '../AgentModeHandler';
import { ConversationService } from '../../services/conversation/ConversationService';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ThoughtAgent } from '../../agents/ThoughtAgent';
import { PlannerAgent } from '../../agents/PlannerAgent';
import { ExecutorAgent } from '../../agents/ExecutorAgent';
import { ReflectionAgent } from '../../agents/ReflectionAgent';
import { ConversationContext, Tool } from 'shared';
import { Plan, Thought, Execution, Reflection } from '../../types';

// Mock dependencies
vi.mock('../../services/conversation/ConversationService');
vi.mock('../../kernel/KernelAdapter');
vi.mock('../../agents/ThoughtAgent');
vi.mock('../../agents/PlannerAgent');
vi.mock('../../agents/ExecutorAgent');
vi.mock('../../agents/ReflectionAgent');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid'),
}));

describe('AgentModeHandler', () => {
  let agentModeHandler: AgentModeHandler;
  let mockConversationService: any;
  let mockKernelAdapter: any;
  let mockEventBus: any;
  let mockToolRegistry: any;
  let mockThoughtAgent: any;
  let mockPlannerAgent: any;
  let mockExecutorAgent: any;
  let mockReflectionAgent: any;

  const createMockTools = (): Tool[] => [
    {
      name: 'calculate',
      description: 'Perform mathematical calculations',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
        },
        required: ['expression'],
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
      executeTool: vi.fn().mockResolvedValue({ success: true, data: { result: 42 } }),
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

    // Mock ExecutorAgent
    mockExecutorAgent = {
      executePlan: vi.fn(),
    };
    (ExecutorAgent as any).mockImplementation(() => mockExecutorAgent);

    // Mock ReflectionAgent
    mockReflectionAgent = {
      reflect: vi.fn(),
    };
    (ReflectionAgent as any).mockImplementation(() => mockReflectionAgent);

    agentModeHandler = new AgentModeHandler(mockConversationService, mockKernelAdapter);
  });

  describe('handle', () => {
    const createTestOptions = (overrides: any = {}) => ({
      userId: 'user-123',
      query: 'Calculate 2 + 2',
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
      reasoning: 'Need to perform a calculation',
      considerations: ['Use calculator tool'],
      assumptions: ['Simple arithmetic'],
    });

    const createMockPlan = (): Plan => ({
      id: 'plan-123',
      steps: [
        {
          id: 'step-1',
          order: 1,
          description: 'Calculate 2 + 2',
          tool: 'calculate',
          parameters: { expression: '2 + 2' },
          dependencies: [],
        },
      ],
      requiredTools: ['calculate'],
      confidence: 0.95,
      reasoning: 'Simple calculation',
    });

    const createMockExecution = (plan: Plan): Execution => ({
      id: 'execution-123',
      plan,
      status: 'completed',
      steps: [
        {
          planStepId: 'step-1',
          status: 'completed',
          result: { result: 4 },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
      results: {
        steps: [
          {
            stepId: 'step-1',
            status: 'completed',
            result: { result: 4 },
          },
        ],
      },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const createMockReflection = (): Reflection => ({
      success: true,
      analysis: 'Calculation completed successfully',
      issues: [],
      improvements: [],
      shouldIterate: false,
    });

    it('should discover tools from kernel registry', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      await agentModeHandler.handle(options);

      expect(mockToolRegistry.discoverTools).toHaveBeenCalledWith('', 100);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.agent.tools.discovered',
        expect.objectContaining({
          toolCount: 1,
          toolNames: ['calculate'],
        }),
        expect.any(Object)
      );
    });

    it('should pass available tools to agents', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
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
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      await agentModeHandler.handle(options);

      expect(mockThoughtAgent.generateThought).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: tools,
        })
      );
      expect(mockPlannerAgent.generatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: tools,
        })
      );
    });

    it('should validate plan tools after generation', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      await agentModeHandler.handle(options);

      expect(mockToolRegistry.validateTool).toHaveBeenCalledWith(
        'calculate',
        { expression: '2 + 2' }
      );
    });

    it('should emit validation warnings for invalid tools', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      // Make validation fail
      mockToolRegistry.validateTool.mockResolvedValue({
        valid: false,
        errors: ['Missing required parameter: expression'],
      });

      await agentModeHandler.handle(options);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.agent.validation.warnings',
        expect.objectContaining({
          planId: plan.id,
          warnings: expect.arrayContaining([
            expect.stringContaining('Step 1 tool "calculate" validation failed'),
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
            description: 'Manual calculation',
            dependencies: [],
          },
        ],
        requiredTools: [],
        confidence: 0.7,
      };
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
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
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      const result = await agentModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(mockThoughtAgent.generateThought).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: [],
        })
      );
    });

    it('should execute plan and reflect on results', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      const result = await agentModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(result.execution.status).toBe('completed');
      expect(mockExecutorAgent.executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan,
          kernelAdapter: mockKernelAdapter,
        })
      );
      expect(mockReflectionAgent.reflect).toHaveBeenCalledWith(
        expect.objectContaining({
          query: options.query,
          plan,
          execution,
        })
      );
    });

    it('should emit plan completed event with validation info', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const thought = createMockThought();
      const plan = createMockPlan();
      const execution = createMockExecution(plan);
      const reflection = createMockReflection();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockThoughtAgent.generateThought.mockResolvedValue(thought);
      mockPlannerAgent.generatePlan.mockResolvedValue(plan);
      mockExecutorAgent.executePlan.mockResolvedValue(execution);
      mockReflectionAgent.reflect.mockResolvedValue(reflection);

      await agentModeHandler.handle(options);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.agent.plan.completed',
        expect.objectContaining({
          planId: plan.id,
          stepCount: 1,
          validationWarnings: 0,
        }),
        expect.any(Object)
      );
    });
  });
});

