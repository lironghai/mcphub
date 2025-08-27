import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import { handleCallToolRequest } from '../services/mcpService.js';
import { searchToolsByVector } from '../services/vectorSearchService.js';
import { getSmartRoutingConfig } from '../utils/smartRouting.js';

/**
 * Interface for tool call request
 */
export interface ToolCallRequest {
  toolName: string;
  arguments?: Record<string, any>;
}

/**
 * Interface for tool search request
 */
export interface ToolSearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
}

/**
 * Interface for tool call result
 */
interface ToolCallResult {
  content?: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
  isError?: boolean;
  [key: string]: any;
}

/**
 * Search for tools using smart routing
 */
export const searchTools = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit = 10, threshold = 0.65 } = req.body as ToolSearchRequest;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Query parameter is required and must be a string',
      });
      return;
    }

    // Check if smart routing is enabled
    const smartRoutingConfig = getSmartRoutingConfig();
    if (!smartRoutingConfig.enabled) {
      res.status(503).json({
        success: false,
        message: 'Smart routing is not enabled. Please enable it in settings.',
      });
      return;
    }

    const limitNum = Math.min(Math.max(parseInt(String(limit)) || 10, 1), 100);
    
    // Use provided threshold or apply dynamic adjustment
    let thresholdNum = typeof threshold === 'number' ? Math.max(0, Math.min(1, threshold)) : 0.65;
    
    // If no explicit threshold provided, dynamically adjust based on query characteristics
    if (typeof threshold !== 'number') {
      // For more general queries, use a lower threshold to get more diverse results
      if (query.length < 10 || query.split(' ').length <= 2) {
        thresholdNum = 0.5;
      }

      // For very specific queries, use a higher threshold for more precise results
      if (query.length > 30 || query.includes('specific') || query.includes('exact')) {
        thresholdNum = 0.75;
      }
    }

    console.log(`Using similarity threshold: ${thresholdNum} for query: "${query}"`);

    const searchResults = await searchToolsByVector(query, limitNum, thresholdNum);

    // Sort results by similarity score in descending order
    const sortedResults = searchResults.sort((a, b) => b.similarity - a.similarity);

    // Group tools by server for better frontend processing
    const serverMap = new Map<string, any>();
    
    sortedResults.forEach(result => {
      if (!serverMap.has(result.serverName)) {
        serverMap.set(result.serverName, {
          serverName: result.serverName,
          tools: []
        });
      }
      
      serverMap.get(result.serverName)!.tools.push({
        name: result.toolName,
        description: result.description,
        inputSchema: result.inputSchema,
        similarity: result.similarity,
        serverName: result.serverName
      });
    });

    // Sort each server's tools by similarity as well and add server-level scoring
    const servers = Array.from(serverMap.values()).map(server => ({
      ...server,
      tools: server.tools.sort((a: any, b: any) => b.similarity - a.similarity),
      maxSimilarity: Math.max(...server.tools.map((tool: any) => tool.similarity)),
      avgSimilarity: server.tools.reduce((sum: number, tool: any) => sum + tool.similarity, 0) / server.tools.length
    }));

    // Sort servers by their highest tool similarity score
    servers.sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    const response: ApiResponse = {
      success: true,
              data: {
          tools: sortedResults, // Keep original format for compatibility, but sorted
          servers: servers, // Add grouped format
        metadata: {
          query: query,
          threshold: thresholdNum,
          totalResults: sortedResults.length,
          serverCount: servers.length,
          guideline:
            sortedResults.length > 0
              ? "Found relevant tools. If these tools don't match exactly what you need, try another search with more specific keywords."
              : 'No tools found. Try broadening your search or using different keywords.',
          nextSteps:
            sortedResults.length > 0
              ? 'Use the found tools in your servers.'
              : 'Consider searching for related capabilities or more general terms.',
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error searching tools:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search tools',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
};

/**
 * Call a specific tool with given arguments
 */
export const callTool = async (req: Request, res: Response): Promise<void> => {
  try {
    const { server } = req.params;
    const { toolName, arguments: toolArgs = {} } = req.body as ToolCallRequest;

    if (!toolName) {
      res.status(400).json({
        success: false,
        message: 'toolName is required',
      });
      return;
    }

    // Create a mock request structure for handleCallToolRequest
    const mockRequest = {
      params: {
        name: 'call_tool',
        arguments: {
          toolName,
          arguments: toolArgs,
        },
      },
    };

    const extra = {
      sessionId: req.headers['x-session-id'] || 'api-session',
      server: server || undefined,
    };

    const result = (await handleCallToolRequest(mockRequest, extra)) as ToolCallResult;

    const response: ApiResponse = {
      success: true,
      data: {
        content: result.content || [],
        toolName,
        arguments: toolArgs,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error calling tool:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to call tool',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
};
