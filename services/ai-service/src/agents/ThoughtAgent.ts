import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AgentConfig, ConversationContext, Thought } from '../types';
import { Tool } from 'shared';

export interface ThoughtAgentOptions {
  query: string;
  context: ConversationContext;
  agentConfig: AgentConfig;
  availableTools?: Tool[];
}

export class ThoughtAgent {
  async generateThought(options: ThoughtAgentOptions): Promise<Thought> {
    const { query, context, agentConfig, availableTools = [] } = options;

    // Build tools section for prompt
    let toolsSection = '';
    if (availableTools.length > 0) {
      toolsSection = `\n\nAvailable Tools:
${availableTools.map(tool => {
  const requiredParams = tool.inputSchema.required || [];
  const allParams = Object.keys(tool.inputSchema.properties || {});
  return `- ${tool.name}: ${tool.description}
  Required parameters: ${requiredParams.length > 0 ? requiredParams.join(', ') : 'none'}
  Optional parameters: ${allParams.filter(p => !requiredParams.includes(p)).join(', ') || 'none'}`;
}).join('\n')}

When reasoning about the task, consider which of these tools (if any) would be useful.
If no suitable tools are available for a step, it should be marked as a manual step.`;
    } else {
      toolsSection = '\n\nNote: No tools are currently available. All steps will need to be manual or require external execution.';
    }

    // Create a specialized prompt for reasoning
    const reasoningPrompt = `You are a reasoning agent. Analyze the following user query and provide structured reasoning.

User Query: ${query}

${context.messages.length > 0 ? `\nConversation Context:\n${context.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}${toolsSection}

Please provide:
1. Your reasoning about what the user wants to accomplish
2. Key considerations and constraints (including tool availability)
3. Any assumptions you're making

Format your response as JSON with the following structure:
{
  "reasoning": "Your detailed reasoning about the task",
  "considerations": ["consideration1", "consideration2", ...],
  "assumptions": ["assumption1", "assumption2", ...]
}`;

    const provider = LLMProviderFactory.createFromConfig(agentConfig);
    
    // Use a slightly higher temperature for reasoning
    const reasoningConfig: AgentConfig = {
      ...agentConfig,
      temperature: Math.min(agentConfig.temperature + 0.1, 1.0),
    };

    const response = await provider.generateResponse(
      reasoningPrompt,
      { sessionId: context.sessionId, messages: [] },
      reasoningConfig
    );

    // Parse JSON response
    try {
      const thought = JSON.parse(response.content) as Thought;
      
      // Validate structure
      if (!thought.reasoning) {
        throw new Error('Invalid thought structure: missing reasoning');
      }
      
      return {
        reasoning: thought.reasoning || '',
        considerations: Array.isArray(thought.considerations) ? thought.considerations : [],
        assumptions: Array.isArray(thought.assumptions) ? thought.assumptions : [],
      };
    } catch (parseError) {
      // If JSON parsing fails, extract reasoning from text
      return {
        reasoning: response.content,
        considerations: [],
        assumptions: [],
      };
    }
  }
}


