import axios from 'axios';

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

/**
 * Make a JSON-RPC request to MCP server
 */
export async function makeJSONRPCRequest(
  baseUrl: string,
  method: string,
  params?: any,
  apiPath: string = ''
): Promise<JSONRPCResponse> {
  const request: JSONRPCRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const response = await axios.post<JSONRPCResponse>(
    `${baseUrl}${apiPath}/sse`,
    request,
    {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.data.error) {
    throw new Error(`JSON-RPC error: ${response.data.error.message}`);
  }

  return response.data;
}

/**
 * Check if MCP server is available
 */
export async function checkMCPAvailability(
  baseUrl: string,
  apiPath: string = ''
): Promise<boolean> {
  try {
    // First check health endpoint
    try {
      const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
      if (healthResponse.data?.status === 'healthy') {
        // Health check passed, now verify JSON-RPC works
        try {
          await makeJSONRPCRequest(baseUrl, 'tools/list', undefined, apiPath);
          return true;
        } catch {
          // Health check passed but JSON-RPC failed - server might be partially available
          return true;
        }
      }
    } catch (error: any) {
      // Health endpoint might not exist, try JSON-RPC directly
    }

    // Try JSON-RPC tools/list as primary check
    try {
      await makeJSONRPCRequest(baseUrl, 'tools/list', undefined, apiPath);
      return true;
    } catch (error: any) {
      // If it's a connection error, server is not available
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return false;
      }
      // Other errors might mean server is available but request failed
      return true;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Load test environment variables
 */
export function loadTestEnv(): {
  mcpBaseUrl: string;
  mcpApiPath?: string;
} {
  return {
    mcpBaseUrl: process.env.MCP_BASE_URL || 'http://localhost:5011',
    mcpApiPath: process.env.MCP_API_PATH || '',
  };
}

/**
 * Extract tools from JSON-RPC response
 */
export function extractToolsFromResponse(response: JSONRPCResponse): any[] {
  const result = response.result;
  if (result?.tools && Array.isArray(result.tools)) {
    return result.tools;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

