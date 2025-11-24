import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AgentConfig, ConversationContext, Thought } from '../types';

export interface ThoughtAgentOptions {
  query: string;
  context: ConversationContext;
  agentConfig: AgentConfig;
}

export class ThoughtAgent {
  async generateThought(options: ThoughtAgentOptions): Promise<Thought> {
    const { query, context, agentConfig } = options;

    // Create a specialized prompt for reasoning
    const reasoningPrompt = `You are a reasoning agent. Analyze the following user query and provide structured reasoning.

User Query: ${query}

${context.messages.length > 0 ? `\nConversation Context:\n${context.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Please provide:
1. Your reasoning about what the user wants to accomplish
2. Key considerations and constraints
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


