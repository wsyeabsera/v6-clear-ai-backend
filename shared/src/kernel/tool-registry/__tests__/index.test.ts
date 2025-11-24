import { describe, it, expect } from 'vitest';
import * as ToolRegistryExports from '../index';

describe('Tool Registry Index Exports', () => {
  it('should export IToolRegistry interface type', () => {
    // Type test - will fail at compile time if not exported
    const mockRegistry: ToolRegistryExports.IToolRegistry = {
      initialize: async () => {},
      discoverTools: async () => [],
      getTool: async () => null,
      executeTool: async () => ({ success: true }),
      listTools: async () => [],
    };
    expect(mockRegistry).toBeDefined();
  });

  it('should export ToolRegistryFactory', () => {
    expect(ToolRegistryExports.ToolRegistryFactory).toBeDefined();
    expect(ToolRegistryExports.ToolRegistryFactory.create).toBeDefined();
    expect(typeof ToolRegistryExports.ToolRegistryFactory.create).toBe('function');
  });

  it('should export LocalToolRegistry', () => {
    expect(ToolRegistryExports.LocalToolRegistry).toBeDefined();
    expect(typeof ToolRegistryExports.LocalToolRegistry).toBe('function');
  });

  it('should export MCPToolRegistry', () => {
    expect(ToolRegistryExports.MCPToolRegistry).toBeDefined();
    expect(typeof ToolRegistryExports.MCPToolRegistry).toBe('function');
  });

  it('should export Tool type', () => {
    // Type test for Tool
    const tool: ToolRegistryExports.Tool = {
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    };
    expect(tool).toBeDefined();
  });

  it('should export ToolExecutionResult type', () => {
    // Type test for ToolExecutionResult
    const result: ToolRegistryExports.ToolExecutionResult = {
      success: true,
      data: { test: 'value' },
    };
    expect(result).toBeDefined();
  });

  it('should export ToolRegistryConfig type', () => {
    // Type test for ToolRegistryConfig
    const config: ToolRegistryExports.ToolRegistryConfig = {
      type: 'local',
      config: {},
    };
    expect(config).toBeDefined();
  });

  it('should be able to create LocalToolRegistry via factory', () => {
    const registry = ToolRegistryExports.ToolRegistryFactory.create(
      ToolRegistryExports.ToolRegistryType.LOCAL,
      {}
    );
    expect(registry).toBeInstanceOf(ToolRegistryExports.LocalToolRegistry);
  });

  it('should be able to create MCPToolRegistry via factory', () => {
    const registry = ToolRegistryExports.ToolRegistryFactory.create(
      ToolRegistryExports.ToolRegistryType.MCP,
      {
        baseUrl: 'http://localhost:5011',
      }
    );
    expect(registry).toBeInstanceOf(ToolRegistryExports.MCPToolRegistry);
  });
});

