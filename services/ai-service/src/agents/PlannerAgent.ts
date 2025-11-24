import { v4 as uuidv4 } from 'uuid';
import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AgentConfig, ConversationContext, Plan, PlanStep, Thought } from '../types';

export interface PlannerAgentOptions {
  query: string;
  thought: Thought;
  context: ConversationContext;
  agentConfig: AgentConfig;
}

export class PlannerAgent {
  async generatePlan(options: PlannerAgentOptions): Promise<Plan> {
    const { query, thought, context, agentConfig } = options;

    // Create a specialized prompt for planning
    const planningPrompt = `You are a planning agent. Based on the reasoning provided, create a structured plan to accomplish the user's goal.

User Query: ${query}

Reasoning:
${thought.reasoning}

${thought.considerations.length > 0 ? `\nConsiderations:\n${thought.considerations.map(c => `- ${c}`).join('\n')}` : ''}
${thought.assumptions.length > 0 ? `\nAssumptions:\n${thought.assumptions.map(a => `- ${a}`).join('\n')}` : ''}

${context.messages.length > 0 ? `\nConversation Context:\n${context.messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Create a detailed, step-by-step plan. Each step should be clear and actionable. If a step requires a tool, specify which tool and what parameters.

Format your response as JSON with the following structure:
{
  "steps": [
    {
      "order": 1,
      "description": "Step description",
      "tool": "tool-name (optional)",
      "parameters": {"param": "value"} (optional),
      "dependencies": [] (array of step order numbers this step depends on)
    },
    ...
  ],
  "estimatedDuration": 60 (optional, in seconds),
  "requiredTools": ["tool1", "tool2", ...] (optional),
  "confidence": 0.85 (0-1 scale),
  "reasoning": "Brief explanation of the plan approach"
}`;

    const provider = LLMProviderFactory.createFromConfig(agentConfig);
    
    // Use a slightly lower temperature for more structured planning
    const planningConfig: AgentConfig = {
      ...agentConfig,
      temperature: Math.max(agentConfig.temperature - 0.1, 0.1),
    };

    const response = await provider.generateResponse(
      planningPrompt,
      { sessionId: context.sessionId, messages: [] },
      planningConfig
    );

    // Parse JSON response
    try {
      const planData = JSON.parse(response.content) as {
        steps: Array<{
          order: number;
          description: string;
          tool?: string;
          parameters?: Record<string, any>;
          dependencies?: number[];
        }>;
        estimatedDuration?: number;
        requiredTools?: string[];
        confidence?: number;
        reasoning?: string;
      };

      // Validate and transform steps
      if (!Array.isArray(planData.steps) || planData.steps.length === 0) {
        throw new Error('Plan must have at least one step');
      }

      const steps: PlanStep[] = planData.steps.map((step, index) => ({
        id: uuidv4(),
        order: step.order || index + 1,
        description: step.description || `Step ${index + 1}`,
        tool: step.tool,
        parameters: step.parameters,
        dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
      }));

      // Validate dependencies
      const stepOrders = new Set(steps.map(s => s.order));
      for (const step of steps) {
        for (const dep of step.dependencies) {
          if (!stepOrders.has(dep)) {
            console.warn(`Warning: Step ${step.order} depends on non-existent step ${dep}`);
          }
        }
      }

      return {
        id: uuidv4(),
        steps,
        estimatedDuration: planData.estimatedDuration,
        requiredTools: Array.isArray(planData.requiredTools) ? planData.requiredTools : [],
        confidence: Math.max(0, Math.min(1, planData.confidence || 0.7)),
        reasoning: planData.reasoning || thought.reasoning,
      };
    } catch (parseError) {
      // If JSON parsing fails, create a simple plan from the response
      const lines = response.content.split('\n').filter(l => l.trim().length > 0);
      const steps: PlanStep[] = lines.map((line, index) => ({
        id: uuidv4(),
        order: index + 1,
        description: line.trim(),
        dependencies: [],
      }));

      return {
        id: uuidv4(),
        steps,
        confidence: 0.5,
        requiredTools: [],
        reasoning: 'Plan generated from unstructured response',
      };
    }
  }
}


