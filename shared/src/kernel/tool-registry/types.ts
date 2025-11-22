// Tool interface representing a tool definition
export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Validation result for tool parameter validation
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Tool execution result
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Tool registry type enum
export enum ToolRegistryType {
  LOCAL = 'local',
  MCP = 'mcp',
}

// Minimal tool registry interface
export interface IToolRegistry {
  discoverTools(query: string, limit?: number): Promise<Tool[]>;
  validateTool(toolName: string, params: any): Promise<ValidationResult>;
  executeTool(toolName: string, params: any): Promise<ToolResult>;
}

// Factory configuration interfaces for each type
export interface LocalToolConfig {
  initialTools?: Tool[];
}

export interface MCPToolConfig {
  baseUrl: string;
  timeout?: number;
  apiPath?: string; // Optional API path prefix (e.g., '/api')
}

export type ToolRegistryConfig = LocalToolConfig | MCPToolConfig;

