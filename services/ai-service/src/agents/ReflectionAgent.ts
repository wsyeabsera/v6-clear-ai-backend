import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AgentConfig, ConversationContext, Execution } from '../types';
import { ExecutorAgent } from './ExecutorAgent';

export interface Reflection {
  success: boolean;
  analysis: string;
  issues: string[];
  improvements: string[];
  shouldIterate: boolean;
  nextSteps?: string[];
}

export interface ReflectionAgentOptions {
  query: string;
  plan: Execution['plan'];
  execution: Execution;
  context: ConversationContext;
  agentConfig: AgentConfig;
}

export class ReflectionAgent {
  async reflect(options: ReflectionAgentOptions): Promise<Reflection> {
    const { query, plan, execution, context, agentConfig } = options;

    // Create a reflection prompt
    const reflectionPrompt = `You are a reflection agent. Analyze the execution results and determine if the goal was achieved.

Original Query: ${query}

Plan:
${plan.steps.map(s => `${s.order}. ${s.description}`).join('\n')}

Execution Results:
${execution.steps.map(s => {
  const step = plan.steps.find(ps => ps.id === s.planStepId);
  return `${step?.order || '?'}. ${step?.description || 'Unknown step'}: ${s.status}${s.error ? ` (Error: ${s.error})` : ''}${s.result ? `\n   Result: ${JSON.stringify(s.result).substring(0, 200)}` : ''}`;
}).join('\n\n')}

Execution Status: ${execution.status}
${execution.error ? `Error: ${execution.error}` : ''}

Analyze:
1. Was the original goal achieved?
2. What issues occurred (if any)?
3. What could be improved?
4. Should we iterate and try again?

Format your response as JSON:
{
  "success": true/false,
  "analysis": "Detailed analysis of the execution",
  "issues": ["issue1", "issue2", ...],
  "improvements": ["improvement1", "improvement2", ...],
  "shouldIterate": true/false,
  "nextSteps": ["step1", "step2", ...] (if shouldIterate is true)
}`;

    const provider = LLMProviderFactory.createFromConfig(agentConfig);
    
    // Use moderate temperature for reflection
    const reflectionConfig: AgentConfig = {
      ...agentConfig,
      temperature: agentConfig.temperature,
    };

    const response = await provider.generateResponse(
      reflectionPrompt,
      { sessionId: context.sessionId, messages: [] },
      reflectionConfig
    );

    // Parse JSON response
    try {
      const reflection = JSON.parse(response.content) as Reflection;
      
      // Validate structure
      if (typeof reflection.success !== 'boolean') {
        reflection.success = execution.status === 'completed' && !execution.error;
      }
      if (!reflection.analysis) {
        reflection.analysis = response.content;
      }
      if (!Array.isArray(reflection.issues)) {
        reflection.issues = [];
      }
      if (!Array.isArray(reflection.improvements)) {
        reflection.improvements = [];
      }
      if (typeof reflection.shouldIterate !== 'boolean') {
        reflection.shouldIterate = !reflection.success && execution.status === 'failed';
      }

      return reflection;
    } catch (parseError) {
      // If JSON parsing fails, create basic reflection
      const success = execution.status === 'completed' && !execution.error;
      return {
        success,
        analysis: response.content,
        issues: execution.error ? [execution.error] : [],
        improvements: [],
        shouldIterate: !success,
      };
    }
  }
}


