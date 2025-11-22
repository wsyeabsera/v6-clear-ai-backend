import {
  IToolRegistry,
  Tool,
  ValidationResult,
  ToolResult,
  LocalToolConfig,
} from '../types';

export class LocalToolRegistry implements IToolRegistry {
  private tools: Map<string, Tool>;

  constructor(config?: LocalToolConfig) {
    this.tools = new Map<string, Tool>();

    // Register initial tools if provided
    if (config?.initialTools) {
      for (const tool of config.initialTools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  async discoverTools(query: string, limit?: number): Promise<Tool[]> {
    if (!query || query.trim().length === 0) {
      return Array.from(this.tools.values()).slice(0, limit);
    }

    const queryLower = query.toLowerCase().trim();
    const matchingTools: Tool[] = [];

    for (const tool of this.tools.values()) {
      const nameMatch = tool.name.toLowerCase().includes(queryLower);
      const descriptionMatch = tool.description.toLowerCase().includes(queryLower);

      if (nameMatch || descriptionMatch) {
        matchingTools.push(tool);
      }

      if (limit && matchingTools.length >= limit) {
        break;
      }
    }

    return matchingTools;
  }

  async validateTool(toolName: string, params: any): Promise<ValidationResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        valid: false,
        errors: [`Tool "${toolName}" not found`],
      };
    }

    const errors: string[] = [];
    const schema = tool.inputSchema;

    // Validate that params is an object
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      errors.push('Parameters must be an object');
      return { valid: false, errors };
    }

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in params)) {
          errors.push(`Missing required parameter: ${requiredField}`);
        }
      }
    }

    // Validate each property
    if (schema.properties) {
      for (const [key, value] of Object.entries(params)) {
        if (!(key in schema.properties)) {
          errors.push(`Unknown parameter: ${key}`);
          continue;
        }

        const propertySchema = schema.properties[key];
        const paramValue = value;

        // Basic type validation
        if (propertySchema.type) {
          const typeMatch = this.validateType(paramValue, propertySchema.type);
          if (!typeMatch) {
            errors.push(
              `Parameter "${key}" must be of type ${propertySchema.type}, got ${typeof paramValue === 'object' && paramValue !== null && !Array.isArray(paramValue) ? 'object' : Array.isArray(paramValue) ? 'array' : typeof paramValue}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async executeTool(toolName: string, params: any): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
      };
    }

    // Validate parameters first
    const validation = await this.validateTool(toolName, params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors?.join(', ')}`,
      };
    }

    // Mock execution - return success with params as data
    // In a real implementation, this would call the actual tool
    return {
      success: true,
      data: {
        tool: toolName,
        params,
        message: `Tool "${toolName}" executed successfully (mock)`,
      },
    };
  }

  /**
   * Register a new tool
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Validate a value against a type
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true; // Unknown types pass validation
    }
  }
}

