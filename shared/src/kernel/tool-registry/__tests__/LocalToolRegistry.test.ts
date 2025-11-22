import { describe, it, expect, beforeEach } from 'vitest';
import { LocalToolRegistry } from '../implementations/LocalToolRegistry';
import { Tool } from '../types';

describe('LocalToolRegistry', () => {
  let registry: LocalToolRegistry;

  const createTestTool = (name: string, description: string): Tool => ({
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        param1: { type: 'string' },
        param2: { type: 'number' },
      },
      required: ['param1'],
    },
  });

  beforeEach(() => {
    registry = new LocalToolRegistry();
  });

  describe('constructor', () => {
    it('should create empty registry when no initial tools provided', () => {
      const emptyRegistry = new LocalToolRegistry();
      expect(emptyRegistry.getAllTools()).toHaveLength(0);
    });

    it('should initialize with provided tools', () => {
      const tools: Tool[] = [
        createTestTool('tool1', 'First tool'),
        createTestTool('tool2', 'Second tool'),
      ];
      const registryWithTools = new LocalToolRegistry({ initialTools: tools });
      expect(registryWithTools.getAllTools()).toHaveLength(2);
    });
  });

  describe('registerTool', () => {
    it('should register a new tool', () => {
      const tool = createTestTool('test-tool', 'Test description');
      registry.registerTool(tool);
      expect(registry.getAllTools()).toHaveLength(1);
      expect(registry.getTool('test-tool')).toEqual(tool);
    });

    it('should overwrite existing tool with same name', () => {
      const tool1 = createTestTool('test-tool', 'First description');
      const tool2 = createTestTool('test-tool', 'Second description');
      registry.registerTool(tool1);
      registry.registerTool(tool2);
      expect(registry.getAllTools()).toHaveLength(1);
      expect(registry.getTool('test-tool')?.description).toBe('Second description');
    });
  });

  describe('unregisterTool', () => {
    it('should unregister an existing tool', () => {
      const tool = createTestTool('test-tool', 'Test description');
      registry.registerTool(tool);
      const result = registry.unregisterTool('test-tool');
      expect(result).toBe(true);
      expect(registry.getAllTools()).toHaveLength(0);
    });

    it('should return false when unregistering non-existent tool', () => {
      const result = registry.unregisterTool('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('discoverTools', () => {
    beforeEach(() => {
      registry.registerTool(createTestTool('read-file', 'Reads a file from disk'));
      registry.registerTool(createTestTool('write-file', 'Writes content to a file'));
      registry.registerTool(createTestTool('search-code', 'Searches code in repository'));
      registry.registerTool(createTestTool('execute-command', 'Executes a shell command'));
    });

    it('should return all tools when query is empty', async () => {
      const tools = await registry.discoverTools('');
      expect(tools).toHaveLength(4);
    });

    it('should return all tools when query is whitespace', async () => {
      const tools = await registry.discoverTools('   ');
      expect(tools).toHaveLength(4);
    });

    it('should find tools by name', async () => {
      const tools = await registry.discoverTools('read');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read-file');
    });

    it('should find tools by description', async () => {
      const tools = await registry.discoverTools('disk');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read-file');
    });

    it('should find multiple tools matching query', async () => {
      const tools = await registry.discoverTools('file');
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('read-file');
      expect(tools.map((t) => t.name)).toContain('write-file');
    });

    it('should be case-insensitive', async () => {
      const tools = await registry.discoverTools('FILE');
      expect(tools).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      const tools = await registry.discoverTools('', 2);
      expect(tools).toHaveLength(2);
    });

    it('should return empty array when no tools match', async () => {
      const tools = await registry.discoverTools('non-existent-tool');
      expect(tools).toHaveLength(0);
    });

    it('should match partial words', async () => {
      const tools = await registry.discoverTools('exec');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('execute-command');
    });
  });

  describe('validateTool', () => {
    beforeEach(() => {
      registry.registerTool({
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            requiredString: { type: 'string' },
            optionalNumber: { type: 'number' },
            optionalBoolean: { type: 'boolean' },
          },
          required: ['requiredString'],
        },
      });
    });

    it('should return valid for correct parameters', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 'test',
        optionalNumber: 42,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return invalid when tool not found', async () => {
      const result = await registry.validateTool('non-existent', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "non-existent" not found');
    });

    it('should return invalid when missing required parameter', async () => {
      const result = await registry.validateTool('test-tool', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: requiredString');
    });

    it('should return invalid when params is not an object', async () => {
      const result = await registry.validateTool('test-tool', 'not-an-object' as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Parameters must be an object');
    });

    it('should return invalid when params is an array', async () => {
      const result = await registry.validateTool('test-tool', [] as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Parameters must be an object');
    });

    it('should return invalid when params is null', async () => {
      const result = await registry.validateTool('test-tool', null as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Parameters must be an object');
    });

    it('should return invalid for unknown parameters', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 'test',
        unknownParam: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown parameter: unknownParam');
    });

    it('should validate string type', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 123, // Should be string
      });
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('must be of type string'))).toBe(true);
    });

    it('should validate number type', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 'test',
        optionalNumber: 'not-a-number', // Should be number
      });
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('must be of type number'))).toBe(true);
    });

    it('should validate boolean type', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 'test',
        optionalBoolean: 'not-a-boolean', // Should be boolean
      });
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('must be of type boolean'))).toBe(true);
    });

    it('should allow optional parameters to be missing', async () => {
      const result = await registry.validateTool('test-tool', {
        requiredString: 'test',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('executeTool', () => {
    beforeEach(() => {
      registry.registerTool({
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
          required: ['param1'],
        },
      });
    });

    it('should execute tool with valid parameters', async () => {
      const result = await registry.executeTool('test-tool', { param1: 'value' });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.tool).toBe('test-tool');
      expect(result.data.params).toEqual({ param1: 'value' });
    });

    it('should return error when tool not found', async () => {
      const result = await registry.executeTool('non-existent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when validation fails', async () => {
      const result = await registry.executeTool('test-tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should include validation errors in error message', async () => {
      const result = await registry.executeTool('test-tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });
  });

  describe('getAllTools', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getAllTools()).toHaveLength(0);
    });

    it('should return all registered tools', () => {
      registry.registerTool(createTestTool('tool1', 'First'));
      registry.registerTool(createTestTool('tool2', 'Second'));
      const tools = registry.getAllTools();
      expect(tools).toHaveLength(2);
    });
  });

  describe('getTool', () => {
    it('should return undefined for non-existent tool', () => {
      expect(registry.getTool('non-existent')).toBeUndefined();
    });

    it('should return tool by name', () => {
      const tool = createTestTool('test-tool', 'Test');
      registry.registerTool(tool);
      expect(registry.getTool('test-tool')).toEqual(tool);
    });
  });
});

