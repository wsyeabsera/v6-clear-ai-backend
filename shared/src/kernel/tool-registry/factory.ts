import {
  ToolRegistryType,
  IToolRegistry,
  ToolRegistryConfig,
  LocalToolConfig,
  MCPToolConfig,
} from './types';
import { LocalToolRegistry } from './implementations/LocalToolRegistry';
import { MCPToolRegistry } from './implementations/MCPToolRegistry';

export class ToolRegistryFactory {
  static create(
    type: ToolRegistryType,
    config?: ToolRegistryConfig
  ): IToolRegistry {
    switch (type) {
      case ToolRegistryType.LOCAL:
        return new LocalToolRegistry(config as LocalToolConfig);

      case ToolRegistryType.MCP:
        if (!config || !('baseUrl' in config)) {
          throw new Error('MCPToolRegistry requires baseUrl in config');
        }
        return new MCPToolRegistry(config as MCPToolConfig);

      default:
        throw new Error(`Invalid tool registry type: ${type}`);
    }
  }
}

