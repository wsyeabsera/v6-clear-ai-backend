import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToolRegistryType,
  LocalToolConfig,
  MCPToolConfig,
} from '../types';

// Mock implementations before importing factory
vi.mock('../implementations/LocalToolRegistry', () => ({
  LocalToolRegistry: vi.fn().mockImplementation(() => ({
    discoverTools: vi.fn(),
    validateTool: vi.fn(),
    executeTool: vi.fn(),
  })),
}));

vi.mock('../implementations/MCPToolRegistry', () => ({
  MCPToolRegistry: vi.fn().mockImplementation(() => ({
    discoverTools: vi.fn(),
    validateTool: vi.fn(),
    executeTool: vi.fn(),
  })),
}));

import { ToolRegistryFactory } from '../factory';

describe('ToolRegistryFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create LocalToolRegistry instance when type is LOCAL', () => {
      const config: LocalToolConfig = {};
      const registry = ToolRegistryFactory.create(ToolRegistryType.LOCAL, config);

      expect(registry).toBeDefined();
      expect(registry).toHaveProperty('discoverTools');
      expect(registry).toHaveProperty('validateTool');
      expect(registry).toHaveProperty('executeTool');
    });

    it('should create LocalToolRegistry with initial tools', () => {
      const config: LocalToolConfig = {
        initialTools: [
          {
            name: 'test-tool',
            description: 'Test tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
      const registry = ToolRegistryFactory.create(ToolRegistryType.LOCAL, config);
      expect(registry).toBeDefined();
    });

    it('should create MCPToolRegistry instance when type is MCP', () => {
      const config: MCPToolConfig = {
        baseUrl: 'http://localhost:5011',
      };
      const registry = ToolRegistryFactory.create(ToolRegistryType.MCP, config);

      expect(registry).toBeDefined();
      expect(registry).toHaveProperty('discoverTools');
      expect(registry).toHaveProperty('validateTool');
      expect(registry).toHaveProperty('executeTool');
    });

    it('should create MCPToolRegistry with custom timeout', () => {
      const config: MCPToolConfig = {
        baseUrl: 'http://localhost:5011',
        timeout: 5000,
      };
      const registry = ToolRegistryFactory.create(ToolRegistryType.MCP, config);
      expect(registry).toBeDefined();
    });

    it('should create MCPToolRegistry with custom apiPath', () => {
      const config: MCPToolConfig = {
        baseUrl: 'http://localhost:5011',
        apiPath: '/api',
      };
      const registry = ToolRegistryFactory.create(ToolRegistryType.MCP, config);
      expect(registry).toBeDefined();
    });

    it('should throw error for invalid tool registry type', () => {
      expect(() => {
        ToolRegistryFactory.create('invalid' as ToolRegistryType, {} as LocalToolConfig);
      }).toThrow('Invalid tool registry type: invalid');
    });

    it('should throw error when MCP config missing baseUrl', () => {
      expect(() => {
        ToolRegistryFactory.create(ToolRegistryType.MCP, {} as MCPToolConfig);
      }).toThrow('MCPToolRegistry requires baseUrl in config');
    });

    it('should throw error when MCP config is undefined', () => {
      expect(() => {
        ToolRegistryFactory.create(ToolRegistryType.MCP);
      }).toThrow('MCPToolRegistry requires baseUrl in config');
    });

    it('should accept config for LOCAL type', () => {
      const config: LocalToolConfig = {};
      const registry = ToolRegistryFactory.create(ToolRegistryType.LOCAL, config);
      expect(registry).toBeDefined();
    });

    it('should return instances that implement IToolRegistry interface', () => {
      const localConfig: LocalToolConfig = {};
      const localRegistry = ToolRegistryFactory.create(ToolRegistryType.LOCAL, localConfig);

      const mcpConfig: MCPToolConfig = {
        baseUrl: 'http://localhost:5011',
      };
      const mcpRegistry = ToolRegistryFactory.create(ToolRegistryType.MCP, mcpConfig);

      // All should implement IToolRegistry interface
      [localRegistry, mcpRegistry].forEach((registry) => {
        expect(registry).toHaveProperty('discoverTools');
        expect(registry).toHaveProperty('validateTool');
        expect(registry).toHaveProperty('executeTool');
        expect(typeof registry.discoverTools).toBe('function');
        expect(typeof registry.validateTool).toBe('function');
        expect(typeof registry.executeTool).toBe('function');
      });
    });
  });
});

