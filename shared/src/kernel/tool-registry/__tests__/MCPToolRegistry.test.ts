import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { MCPToolRegistry } from '../implementations/MCPToolRegistry';
import { Tool } from '../types';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('MCPToolRegistry', () => {
  let registry: MCPToolRegistry;
  const baseUrl = 'http://localhost:5011';

  const mockTool: Tool = {
    name: 'test-tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: {
        param1: { type: 'string' },
        param2: { type: 'number' },
      },
      required: ['param1'],
    },
  };

  const mockTools: Tool[] = [
    mockTool,
    {
      name: 'another-tool',
      description: 'Another test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new MCPToolRegistry({ baseUrl });
    // Clear cache before each test
    registry.clearCache();
  });

  describe('constructor', () => {
    it('should create registry with baseUrl', () => {
      const newRegistry = new MCPToolRegistry({ baseUrl: 'http://example.com' });
      expect(newRegistry).toBeDefined();
    });

    it('should use default timeout if not provided', () => {
      const newRegistry = new MCPToolRegistry({ baseUrl });
      expect(newRegistry).toBeDefined();
    });

    it('should use custom timeout if provided', () => {
      const newRegistry = new MCPToolRegistry({ baseUrl, timeout: 5000 });
      expect(newRegistry).toBeDefined();
    });

    it('should handle baseUrl with trailing slash', () => {
      const newRegistry = new MCPToolRegistry({ baseUrl: 'http://example.com/' });
      expect(newRegistry).toBeDefined();
    });

    it('should use custom apiPath if provided', () => {
      const newRegistry = new MCPToolRegistry({ baseUrl, apiPath: '/api' });
      expect(newRegistry).toBeDefined();
    });
  });

  describe('discoverTools', () => {
    it('should fetch and cache tools on first call', async () => {
      const mockPost = vi.fn().mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: { tools: [mockTool] },
          id: 1,
        },
      });
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.discoverTools('test');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
      expect(mockPost).toHaveBeenCalledWith(
        '/sse',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'tools/list',
        })
      );
    });

    it('should return all tools when query is empty', async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: mockTools },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.discoverTools('');

      expect(tools).toHaveLength(2);
    });

    it('should use cached tools on subsequent calls', async () => {
      const mockPost = vi.fn().mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: { tools: mockTools },
          id: 1,
        },
      });
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      
      // First call should fetch
      await newRegistry.discoverTools('test');
      expect(mockPost).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await newRegistry.discoverTools('test');
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON-RPC response format', async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: mockTools },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.discoverTools('');

      expect(tools).toHaveLength(2);
    });

    it('should perform keyword search on cached tools', async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: mockTools },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.discoverTools('another');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('another-tool');
    });

    it('should respect limit parameter', async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: mockTools },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.discoverTools('', 1);

      expect(tools).toHaveLength(1);
    });

    it('should handle connection errors', async () => {
      const axiosError = new Error('Connection refused');
      (axiosError as any).code = 'ECONNREFUSED';
      (axiosError as any).isAxiosError = true;
      
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockRejectedValue(axiosError),
      }));
      mockedAxios.isAxiosError = vi.fn(() => true);

      const newRegistry = new MCPToolRegistry({ baseUrl });
      
      await expect(newRegistry.discoverTools('test')).rejects.toThrow(
        'Failed to connect to MCP server'
      );
    });

    it('should handle timeout errors', async () => {
      const axiosError = new Error('Timeout');
      (axiosError as any).code = 'ETIMEDOUT';
      (axiosError as any).isAxiosError = true;
      
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockRejectedValue(axiosError),
      }));
      mockedAxios.isAxiosError = vi.fn(() => true);

      const newRegistry = new MCPToolRegistry({ baseUrl });
      
      await expect(newRegistry.discoverTools('test')).rejects.toThrow(
        'Failed to connect to MCP server'
      );
    });
  });

  describe('validateTool', () => {
    beforeEach(async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools(''); // Initialize cache
      registry = newRegistry;
    });

    it('should return valid for correct parameters', async () => {
      const result = await registry.validateTool('test-tool', {
        param1: 'value',
        param2: 42,
      });
      expect(result.valid).toBe(true);
    });

    it('should return invalid when tool not found', async () => {
      const result = await registry.validateTool('non-existent', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "non-existent" not found');
    });

    it('should return invalid when missing required parameter', async () => {
      const result = await registry.validateTool('test-tool', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: param1');
    });

    it('should return invalid for wrong parameter type', async () => {
      const result = await registry.validateTool('test-tool', {
        param1: 123, // Should be string
      });
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('must be of type string'))).toBe(true);
    });
  });

  describe('executeTool', () => {
    beforeEach(async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools(''); // Initialize cache
      registry = newRegistry;
    });

    it('should execute tool successfully', async () => {
      const mockPost = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        })
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            result: { content: [{ text: 'success' }] },
            id: 2,
          },
        });
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools('');

      const result = await newRegistry.executeTool('test-tool', { param1: 'value' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockPost).toHaveBeenCalledWith(
        '/sse',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'test-tool',
            arguments: { param1: 'value' },
          },
        })
      );
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

    it('should handle JSON-RPC error response', async () => {
      const mockPost = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        })
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: 2,
          },
        });

      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools('');

      const result = await newRegistry.executeTool('test-tool', { param1: 'value' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP server error');
    });

    it('should handle connection errors', async () => {
      const axiosError = new Error('Connection refused');
      (axiosError as any).code = 'ECONNREFUSED';
      (axiosError as any).isAxiosError = true;
      
      const mockPost = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        })
        .mockRejectedValueOnce(axiosError);
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));
      mockedAxios.isAxiosError = vi.fn(() => true);

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools('');

      const result = await newRegistry.executeTool('test-tool', { param1: 'value' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect to MCP server');
    });

    it('should handle timeout errors', async () => {
      const axiosError = new Error('Timeout');
      (axiosError as any).code = 'ETIMEDOUT';
      (axiosError as any).isAxiosError = true;
      
      const mockPost = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            jsonrpc: '2.0',
            result: { tools: [mockTool] },
            id: 1,
          },
        })
        .mockRejectedValueOnce(axiosError);
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));
      mockedAxios.isAxiosError = vi.fn(() => true);

      const newRegistry = new MCPToolRegistry({ baseUrl });
      await newRegistry.discoverTools('');

      const result = await newRegistry.executeTool('test-tool', { param1: 'value' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect to MCP server');
    });
  });

  describe('clearCache', () => {
    it('should clear the tools cache', async () => {
      const mockPost = vi.fn().mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: { tools: mockTools },
          id: 1,
        },
      });
      mockedAxios.create = vi.fn(() => ({
        post: mockPost,
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      
      await newRegistry.discoverTools(''); // Initialize cache
      expect(mockPost).toHaveBeenCalledTimes(1);

      newRegistry.clearCache();
      await newRegistry.discoverTools(''); // Should fetch again
      expect(mockPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllTools', () => {
    it('should return all cached tools', async () => {
      mockedAxios.create = vi.fn(() => ({
        post: vi.fn().mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { tools: mockTools },
            id: 1,
          },
        }),
      }));

      const newRegistry = new MCPToolRegistry({ baseUrl });
      const tools = await newRegistry.getAllTools();

      expect(tools).toHaveLength(2);
    });
  });
});

