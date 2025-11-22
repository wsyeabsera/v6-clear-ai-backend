import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { MCPToolRegistry } from '../implementations/MCPToolRegistry';
import { MCPToolConfig } from '../types';
import { checkMCPAvailability, loadTestEnv } from './integration/utils';

describe('MCPToolRegistry Integration Tests', () => {
  let registry: MCPToolRegistry;
  let config: MCPToolConfig;
  let mcpAvailable = false;

  beforeAll(async () => {
    const env = loadTestEnv();
    mcpAvailable = await checkMCPAvailability(env.mcpBaseUrl, env.mcpApiPath || '');

    if (!mcpAvailable) {
      console.warn('MCP server not available, skipping integration tests');
    }
  });

  beforeEach(async () => {
    if (!mcpAvailable) return;

    const env = loadTestEnv();
    config = {
      baseUrl: env.mcpBaseUrl,
      apiPath: env.mcpApiPath,
      timeout: 15000,
    };

    registry = new MCPToolRegistry(config);
    // Clear cache to ensure fresh fetch
    registry.clearCache();
  });

  afterEach(() => {
    if (!mcpAvailable) return;
    registry.clearCache();
  });

  describe('A. Tool Discovery Tests', () => {
    it('should discover all 28 tools from server', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('');

      expect(tools.length).toBe(28);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('inputSchema');
    });

    it('should verify tool structure (name, description, inputSchema)', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('');

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('should find tools by name using keyword search', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('facility');

      expect(tools.length).toBeGreaterThan(0);
      // Should match tools with "facility" in name or description
      const hasMatch = tools.some(
        (t) =>
          t.name.toLowerCase().includes('facility') ||
          t.description.toLowerCase().includes('facility')
      );
      expect(hasMatch).toBe(true);
    });

    it('should find tools by description using keyword search', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('create');

      expect(tools.length).toBeGreaterThan(0);
      // Should match tools with "create" in name or description
      const hasMatch = tools.some(
        (t) =>
          t.name.toLowerCase().includes('create') ||
          t.description.toLowerCase().includes('create')
      );
      expect(hasMatch).toBe(true);
    });

    it('should respect limit parameter', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('', 5);

      expect(tools.length).toBeLessThanOrEqual(5);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return all tools when query is empty', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('');

      expect(tools.length).toBe(28);
    });

    it('should cache tools after first discovery', async () => {
      if (!mcpAvailable) return;

      // First call should fetch from server
      const tools1 = await registry.discoverTools('');
      expect(tools1.length).toBe(28);

      // Second call should use cache (should return same results quickly)
      const tools2 = await registry.discoverTools('');
      expect(tools2.length).toBe(28);
      expect(tools2.map((t) => t.name)).toEqual(tools1.map((t) => t.name));
    });

    it('should return empty array for non-matching query', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.discoverTools('nonexistenttoolxyz123');

      expect(tools).toHaveLength(0);
    });
  });

  describe('B. Tool Validation Tests', () => {
    it('should validate parameters for create_facility tool', async () => {
      if (!mcpAvailable) return;

      const result = await registry.validateTool('create_facility', {
        name: 'Test Facility',
        shortCode: 'TEST',
        location: 'Test Location',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return invalid when missing required parameters', async () => {
      if (!mcpAvailable) return;

      const result = await registry.validateTool('create_facility', {
        name: 'Test Facility',
        // Missing shortCode and location
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((e) => e.includes('Missing required parameter'))).toBe(true);
    });

    it('should return invalid for wrong parameter types', async () => {
      if (!mcpAvailable) return;

      const result = await registry.validateTool('create_facility', {
        name: 123, // Should be string
        shortCode: 'TEST',
        location: 'Test Location',
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('must be of type string'))).toBe(true);
    });

    it('should return invalid for unknown parameters', async () => {
      if (!mcpAvailable) return;

      const result = await registry.validateTool('create_facility', {
        name: 'Test Facility',
        shortCode: 'TEST',
        location: 'Test Location',
        unknownParam: 'value',
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('Unknown parameter'))).toBe(true);
    });

    it('should validate get_facility tool with valid id parameter', async () => {
      if (!mcpAvailable) return;

      const result = await registry.validateTool('get_facility', {
        id: 'test-id',
      });

      expect(result.valid).toBe(true);
    });

    it('should validate list_facilities tool with optional parameters', async () => {
      if (!mcpAvailable) return;

      // Should be valid with no params (all optional)
      const result1 = await registry.validateTool('list_facilities', {});
      expect(result1.valid).toBe(true);

      // Should be valid with optional params
      const result2 = await registry.validateTool('list_facilities', {
        shortCode: 'TEST',
        location: 'Test',
      });
      expect(result2.valid).toBe(true);
    });
  });

  describe('C. Tool Execution Tests', () => {
    it('should execute list_facilities tool (no params required)', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_facilities', {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute get_facility tool with required id parameter', async () => {
      if (!mcpAvailable) return;

      // First get a list of facilities to get a real ID
      const listResult = await registry.executeTool('list_facilities', {});
      if (!listResult.success || !listResult.data) return;

      // Try to extract an ID from the result (format may vary)
      // If we can't get an ID, we'll test with a known format
      const result = await registry.executeTool('get_facility', {
        id: '6905db9211cc522275d5f013', // Use a known test ID format
      });

      // Execution might succeed or fail depending on if ID exists
      // We just verify the result structure
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should return error when tool not found', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('nonexistent_tool_xyz', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });

    it('should return error when validation fails', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('create_facility', {
        // Missing required parameters
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should verify response structure for successful execution', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_facilities', {});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      if (result.success) {
        expect(result.data).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('D. Real Tool Examples', () => {
    it('should execute list_facilities tool', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_facilities', {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute list_contaminants with optional filters', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_contaminants', {
        // All parameters are optional
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute list_contracts tool', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_contracts', {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute list_shipments tool', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_shipments', {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should execute list_inspections tool', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('list_inspections', {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('E. Error Handling Tests', () => {
    it('should handle invalid tool name gracefully', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('invalid_tool_name_xyz', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid parameters error', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('create_facility', {
        invalid: 'parameter',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing required parameters', async () => {
      if (!mcpAvailable) return;

      const result = await registry.executeTool('create_facility', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  describe('getAllTools', () => {
    it('should return all 28 tools from MCP server', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.getAllTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(28);
    });

    it('should return tools with proper structure', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.getAllTools();

      expect(tools.length).toBeGreaterThan(0);
      const tool = tools[0];
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    });

    it('should include all expected tool categories', async () => {
      if (!mcpAvailable) return;

      const tools = await registry.getAllTools();
      const toolNames = tools.map((t) => t.name);

      // Check for facility tools
      expect(toolNames.some((n) => n.includes('facility'))).toBe(true);
      // Check for contaminant tools
      expect(toolNames.some((n) => n.includes('contaminant'))).toBe(true);
      // Check for inspection tools
      expect(toolNames.some((n) => n.includes('inspection'))).toBe(true);
      // Check for shipment tools
      expect(toolNames.some((n) => n.includes('shipment'))).toBe(true);
      // Check for contract tools
      expect(toolNames.some((n) => n.includes('contract'))).toBe(true);
    });
  });
});
