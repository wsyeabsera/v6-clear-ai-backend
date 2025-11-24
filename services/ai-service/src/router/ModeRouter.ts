import { LLMProviderFactory } from '../services/llm/LLMProviderFactory';
import { AgentConfig, ConversationContext } from '../types';

export type Mode = 'ask' | 'plan' | 'agent';

export interface ModeRouterOptions {
  query: string;
  context: ConversationContext;
  agentConfig: AgentConfig;
  explicitMode?: Mode; // Allow manual override
}

export interface ModeSelection {
  mode: Mode;
  confidence: number;
  reasoning: string;
}

export class ModeRouter {
  /**
   * Route a query to the appropriate mode
   */
  async route(options: ModeRouterOptions): Promise<ModeSelection> {
    const { query, context, agentConfig, explicitMode } = options;

    // If explicit mode is provided, use it
    if (explicitMode) {
      return {
        mode: explicitMode,
        confidence: 1.0,
        reasoning: 'User explicitly selected mode',
      };
    }

    // Use intent classification to determine mode
    const classification = await this.classifyIntent(query, context, agentConfig);

    return classification;
  }

  /**
   * Classify query intent to determine appropriate mode
   */
  private async classifyIntent(
    query: string,
    context: ConversationContext,
    agentConfig: AgentConfig
  ): Promise<ModeSelection> {
    // Simple heuristics first (fast path)
    const heuristicMode = this.heuristicClassification(query);
    if (heuristicMode.confidence > 0.8) {
      return heuristicMode;
    }

    // Use LLM for more complex classification
    try {
      return await this.llmClassification(query, context, agentConfig);
    } catch (error) {
      // Fallback to heuristic if LLM fails
      console.warn('LLM classification failed, using heuristic:', error);
      return heuristicMode;
    }
  }

  /**
   * Heuristic-based classification (fast, no LLM call)
   */
  private heuristicClassification(query: string): ModeSelection {
    const lowerQuery = query.toLowerCase().trim();

    // Agent mode indicators: action verbs, file operations, code changes
    const agentIndicators = [
      'create', 'write', 'delete', 'update', 'modify', 'change', 'edit',
      'implement', 'build', 'add', 'remove', 'fix', 'refactor',
      'file', 'code', 'function', 'class', 'component',
    ];
    const hasAgentIndicators = agentIndicators.some(indicator => lowerQuery.includes(indicator));

    // Plan mode indicators: complex tasks, multi-step, planning keywords
    const planIndicators = [
      'plan', 'strategy', 'steps', 'workflow', 'process', 'approach',
      'how to', 'what steps', 'break down', 'outline',
    ];
    const hasPlanIndicators = planIndicators.some(indicator => lowerQuery.includes(indicator));

    // Ask mode: questions, explanations, simple queries
    const askIndicators = [
      'what', 'why', 'how', 'when', 'where', 'explain', 'describe',
      'tell me', 'what is', '?',
    ];
    const hasAskIndicators = askIndicators.some(indicator => lowerQuery.includes(indicator));

    // Determine mode based on indicators
    if (hasAgentIndicators && query.length > 50) {
      return {
        mode: 'agent',
        confidence: 0.7,
        reasoning: 'Query contains action verbs and is complex enough for execution',
      };
    }

    if (hasPlanIndicators || (query.length > 200 && !hasAskIndicators)) {
      return {
        mode: 'plan',
        confidence: 0.7,
        reasoning: 'Query suggests planning or is complex enough to require a plan',
      };
    }

    // Default to ask mode
    return {
      mode: 'ask',
      confidence: 0.6,
      reasoning: 'Query appears to be a simple question or explanation request',
    };
  }

  /**
   * LLM-based classification (more accurate but slower)
   */
  private async llmClassification(
    query: string,
    context: ConversationContext,
    agentConfig: AgentConfig
  ): Promise<ModeSelection> {
    const classificationPrompt = `You are a mode router. Classify the following user query to determine which mode should handle it:

Modes:
- "ask": Simple questions, explanations, information requests. Fast, direct responses.
- "plan": Complex tasks that need structured planning. Multi-step workflows, strategies. NO execution.
- "agent": Tasks requiring actual execution. Code changes, file operations, tool usage. Full execution with iteration.

User Query: ${query}

${context.messages.length > 0 ? `\nRecent Context:\n${context.messages.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n')}` : ''}

Classify the query and respond with JSON:
{
  "mode": "ask" | "plan" | "agent",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this mode was selected"
}`;

    const provider = LLMProviderFactory.createFromConfig(agentConfig);
    
    // Use lower temperature for more consistent classification
    const classificationConfig: AgentConfig = {
      ...agentConfig,
      temperature: 0.3,
      maxTokens: 200, // Short response for classification
    };

    const response = await provider.generateResponse(
      classificationPrompt,
      { sessionId: context.sessionId, messages: [] },
      classificationConfig
    );

    try {
      const result = JSON.parse(response.content) as ModeSelection;
      
      // Validate mode
      if (!['ask', 'plan', 'agent'].includes(result.mode)) {
        throw new Error('Invalid mode returned');
      }

      // Validate confidence
      if (result.confidence < 0 || result.confidence > 1) {
        result.confidence = 0.7;
      }

      return {
        mode: result.mode as Mode,
        confidence: result.confidence,
        reasoning: result.reasoning || 'LLM classification',
      };
    } catch (parseError) {
      // Fallback to heuristic if parsing fails
      return this.heuristicClassification(query);
    }
  }
}


