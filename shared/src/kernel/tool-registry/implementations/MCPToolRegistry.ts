import axios, { AxiosInstance } from 'axios';
import {
  IToolRegistry,
  Tool,
  ValidationResult,
  ToolResult,
  MCPToolConfig,
} from '../types';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

export class MCPToolRegistry implements IToolRegistry {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiPath: string;
  private toolsCache: Map<string, Tool> | null = null;
  private cacheInitialized: boolean = false;
  private requestIdCounter: number = 1;

  constructor(config: MCPToolConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiPath = config.apiPath || '';
    const timeout = config.timeout || 30000;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async discoverTools(query: string, limit?: number): Promise<Tool[]> {
    // Initialize cache if not already done
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    if (!this.toolsCache) {
      return [];
    }

    // If query is empty, return all tools
    if (!query || query.trim().length === 0) {
      const allTools = Array.from(this.toolsCache.values());
      return limit ? allTools.slice(0, limit) : allTools;
    }

    // Perform keyword search on cached tools
    const queryLower = query.toLowerCase().trim();
    const matchingTools: Tool[] = [];

    for (const tool of this.toolsCache.values()) {
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
    // Initialize cache if not already done
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    const tool = this.toolsCache?.get(toolName);

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
    // Initialize cache if not already done
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    const tool = this.toolsCache?.get(toolName);

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

    try {
      // Use JSON-RPC 2.0 protocol to call tool
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: this.requestIdCounter++,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params,
        },
      };

      const response = await this.client.post<JSONRPCResponse>(
        `${this.apiPath}/sse`,
        request
      );

      // Check for JSON-RPC error
      if (response.data.error) {
        return {
          success: false,
          error: `MCP server error: ${response.data.error.message}`,
        };
      }

      // Extract result content
      const result = response.data.result;
      let resultData: any;

      // Handle different result formats
      if (result?.content) {
        // MCP tools/call typically returns content array
        if (Array.isArray(result.content)) {
          resultData = result.content.map((item: any) => item.text || item).join('\n');
        } else {
          resultData = result.content;
        }
      } else if (result?.text) {
        resultData = result.text;
      } else {
        resultData = result;
      }

      return {
        success: true,
        data: resultData,
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          return {
            success: false,
            error: `Failed to connect to MCP server at ${this.baseUrl}. Make sure the server is running.`,
          };
        }

        if (error.response) {
          return {
            success: false,
            error: `MCP server error: ${error.message}`,
          };
        }

        return {
          success: false,
          error: `Failed to connect to MCP server at ${this.baseUrl}. Make sure the server is running.`,
        };
      }

      return {
        success: false,
        error: `Tool execution failed: ${error?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Make a JSON-RPC request to the MCP server
   */
  private async makeJSONRPCRequest(method: string, params?: any): Promise<JSONRPCResponse> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.requestIdCounter++,
      method,
      params,
    };

    const response = await this.client.post<JSONRPCResponse>(
      `${this.apiPath}/sse`,
      request
    );

    // Check for JSON-RPC error
    if (response.data.error) {
      throw new Error(`JSON-RPC error: ${response.data.error.message}`);
    }

    return response.data;
  }

  /**
   * Initialize the tools cache by fetching from MCP server
   */
  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) {
      return;
    }

    try {
      // Use JSON-RPC 2.0 protocol to list tools
      const response = await this.makeJSONRPCRequest('tools/list');

      // Extract tools from JSON-RPC response
      let tools: Tool[] = [];
      const result = response.result;

      if (result?.tools && Array.isArray(result.tools)) {
        tools = result.tools;
      } else if (Array.isArray(result)) {
        tools = result;
      } else {
        throw new Error('Invalid tools response format: expected tools array');
      }

      // Build cache
      this.toolsCache = new Map<string, Tool>();
      for (const tool of tools) {
        // Ensure tool has required structure
        if (tool.name && tool.description && tool.inputSchema) {
          this.toolsCache.set(tool.name, tool);
        }
      }

      this.cacheInitialized = true;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new Error(
            `Failed to connect to MCP server at ${this.baseUrl}. Make sure the server is running.`
          );
        }
        throw new Error(`Failed to fetch tools from MCP server: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clear the tools cache (useful for testing or refreshing)
   */
  clearCache(): void {
    this.toolsCache = null;
    this.cacheInitialized = false;
  }

  /**
   * Get all cached tools
   */
  async getAllTools(): Promise<Tool[]> {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }
    return Array.from(this.toolsCache?.values() || []);
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

