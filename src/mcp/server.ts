import type { Env } from '../types/env';
import { checkAuth } from './auth';
import { checkRateLimit } from './rate-limiter';
import { getToolPermission, hasPermission } from './access-control';
import { logAudit } from './audit-log';
import { getStatus } from './tools/status-tools';
import { generateArticle, getHistory, getMetrics } from './tools/content-tools';
import { listTasks, createTask, toggleTask, deleteTask, getTaskLogs } from './tools/task-tools';
import {
  getProviderHealth,
  getDLQEntries,
  clearDLQEntries,
  getAnalyticsOverview,
  executeDbQuery,
  executeDbWrite,
  listKvKeys,
  getKvValue,
  putKvValue,
  deleteKvValue,
} from './tools/admin-tools';
import { sendDiscordMessage, executeDiscordApi } from './tools/discord-tools';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-mcp-secret',
  'Access-Control-Max-Age': '86400',
};

interface MCPRequest {
  jsonrpc: string;
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  id?: string | number;
}

interface MCPResponse {
  jsonrpc: string;
  result?: unknown | undefined;
  error?: {
    code: number;
    message: string;
    data?: unknown | undefined;
  } | undefined;
  id?: string | number | undefined;
}

/**
 * MCP server router - handles Model Context Protocol requests
 */
export async function mcpRouter(request: Request, env: Env): Promise<Response> {
  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only accept POST requests
  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed', -32000);
  }

  // 1. Fail closed if MCP_SECRET not configured
  if (!env.MCP_SECRET) {
    return errorResponse(503, 'MCP endpoint not configured', -32001);
  }

  // 2. Authenticate
  const authResult = checkAuth(request, env);
  if (!authResult.ok) {
    return errorResponse(401, authResult.error ?? 'Unauthorized', -32001);
  }

  // 3. Rate limit — skip for authenticated users (have valid x-mcp-secret)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (authResult.role === 'public') {
    const rateLimitOk = await checkRateLimit(ip, env);
    if (!rateLimitOk) {
      return errorResponse(429, 'Rate limit exceeded', -32029);
    }
  }

  // 4. Parse request body
  let body: MCPRequest;
  try {
    body = (await request.json()) as MCPRequest;
  } catch {
    return errorResponse(400, 'Invalid JSON', -32700);
  }

  // 5. Check tool permission if this is a tool call
  if (body.method === 'tools/call' && body.params?.name) {
    const toolName = body.params.name;
    const permission = getToolPermission(toolName);

    if (!hasPermission(authResult.role, permission)) {
      // Log unauthorized attempt
      await logAudit(
        {
          timestamp: new Date().toISOString(),
          ip,
          role: authResult.role,
          tool: toolName,
          params: body.params.arguments,
          success: false,
          error: 'Insufficient permission',
        },
        env
      );

      return errorResponse(
        403,
        `Insufficient permission for tool: ${toolName}`,
        -32003
      );
    }
  }

  // 6. Handle MCP protocol methods
  try {
    const result = await handleMCPMethod(body, env, authResult.role, ip);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  } catch (e) {
    const error = e as Error;
    return errorResponse(500, error.message, -32603);
  }
}

/**
 * Handle MCP protocol methods
 */
async function handleMCPMethod(
  request: MCPRequest,
  env: Env,
  role: string,
  ip: string
): Promise<MCPResponse> {
  const { method, params, id } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'discord-ai-bot',
            version: '4.0.0',
          },
          capabilities: {
            tools: {},
          },
        },
        id,
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        result: {
          tools: await getToolsList(role, env),
        },
        id,
      };

    case 'tools/call':
      if (!params?.name) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Missing tool name',
          },
          id,
        };
      }

      const toolResult = await executeTool(
        params.name,
        params.arguments ?? {},
        env,
        role,
        ip
      );

      return {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult),
            },
          ],
        },
        id,
      };

    default:
      return {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
        id,
      };
  }
}

/**
 * Get list of available tools based on user role
 */
async function getToolsList(role: string, _env: Env) {
  const allTools = [
    // Public tools
    {
      name: 'status',
      description: 'Get system status, health metrics, and statistics',
      inputSchema: { type: 'object', properties: {} },
    },
    // User tools
    {
      name: 'generate-article',
      description: 'Generate and publish an article to Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: { type: 'string', description: 'Discord channel ID (optional, uses default)' },
          category: { type: 'string', enum: ['anime', 'manga', 'game', 'novel'] },
          format: { type: 'string', description: 'Content format (optional, auto-selected)' },
          topic: { type: 'string', description: 'Specific topic (optional, auto-generated)' },
        },
      },
    },
    {
      name: 'get-history',
      description: 'Get content publication history with filters',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default: 7)' },
          format: { type: 'string', description: 'Filter by format' },
          category: { type: 'string', description: 'Filter by category' },
          limit: { type: 'number', description: 'Maximum results (default: 50)' },
        },
      },
    },
    {
      name: 'get-metrics',
      description: 'Get pipeline performance metrics and statistics',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to analyze (default: 7)' },
        },
      },
    },
    // Admin tools
    {
      name: 'task-list',
      description: 'List all scheduled tasks',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'task-create',
      description: 'Create a new scheduled task',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task name' },
          description: { type: 'string', description: 'Task description (optional)' },
          cron: { type: 'string', description: 'Cron expression (e.g., "0 */6 * * *")' },
          action: { type: 'string', description: 'Action to perform (e.g., "generate-article")' },
          params: { type: 'object', description: 'Action parameters (optional)' },
          channelId: { type: 'string', description: 'Discord channel ID' },
          guildId: { type: 'string', description: 'Discord guild ID' },
          category: { type: 'string', description: 'Content category filter (optional)' },
          format: { type: 'string', description: 'Content format filter (optional)' },
          timezone: { type: 'string', description: 'Timezone (default: Asia/Jakarta)' },
        },
        required: ['name', 'cron', 'action', 'channelId', 'guildId'],
      },
    },
    {
      name: 'task-toggle',
      description: 'Enable or disable a scheduled task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          enabled: { type: 'boolean', description: 'Enable (true) or disable (false)' },
        },
        required: ['taskId', 'enabled'],
      },
    },
    {
      name: 'task-delete',
      description: 'Delete a scheduled task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'task-logs',
      description: 'Get execution logs for a task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          limit: { type: 'number', description: 'Maximum results (default: 50)' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'provider-health',
      description: 'Get AI provider health status and statistics',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'dlq-list',
      description: 'List dead letter queue entries',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum results (default: 50)' },
        },
      },
    },
    {
      name: 'dlq-clear',
      description: 'Resolve (clear) dead letter queue entries',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, description: 'DLQ entry IDs' },
          resolution: { type: 'string', description: 'Resolution note' },
        },
        required: ['ids', 'resolution'],
      },
    },
    {
      name: 'analytics',
      description: 'Get comprehensive analytics overview',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to analyze (default: 7)' },
        },
      },
    },
    {
      name: 'db-query',
      description: 'Execute a read-only SQL query on the D1 database',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query string' },
          bindings: { type: 'array', items: { type: 'string' }, description: 'Query bindings (optional)' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'db-execute',
      description: 'Execute a destructive/write SQL query on the D1 database',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL command string' },
          bindings: { type: 'array', items: { type: 'string' }, description: 'Command bindings (optional)' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'kv-list',
      description: 'List keys in the BOT_KV namespace',
      inputSchema: {
        type: 'object',
        properties: {
          prefix: { type: 'string', description: 'Prefix to filter keys by (optional)' },
          limit: { type: 'number', description: 'Maximum number of keys to return (optional)' },
        },
      },
    },
    {
      name: 'kv-get',
      description: 'Get a value from the BOT_KV namespace',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to fetch' },
          type: { type: 'string', enum: ['text', 'json'], description: 'Type of value to return (default: text)' },
        },
        required: ['key'],
      },
    },
    {
      name: 'kv-put',
      description: 'Put a value into the BOT_KV namespace',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to set' },
          value: { type: 'string', description: 'Value to set (stringified)' },
          expirationTtl: { type: 'number', description: 'Expiration TTL in seconds (optional)' },
        },
        required: ['key', 'value'],
      },
    },
    {
      name: 'kv-delete',
      description: 'Delete a key from the BOT_KV namespace',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to delete' },
        },
        required: ['key'],
      },
    },
    {
      name: 'discord-send-message',
      description: 'Send a raw message or embed to a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: { type: 'string', description: 'Discord channel ID' },
          content: { type: 'string', description: 'Message content' },
          embeds: { type: 'array', description: 'Message embeds' },
        },
        required: ['channelId'],
      },
    },
    {
      name: 'discord-api-request',
      description: 'Execute arbitrary raw Discord API calls for full administrative control via the bot',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'API endpoint (e.g., /channels/123/messages)' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
          body: { type: 'object', description: 'JSON request body' },
        },
        required: ['endpoint'],
      },
    },
  ];

  // Filter by role permissions - for now return all, access control enforced at execution
  return allTools;
}

/**
 * Execute a tool call
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  env: Env,
  role: string,
  ip: string
): Promise<unknown> {
  // Log tool execution
  await logAudit(
    {
      timestamp: new Date().toISOString(),
      ip,
      role: role as never,
      tool: toolName,
      params: args,
      success: true,
    },
    env
  );

  // Dispatch to tool implementations
  switch (toolName) {
    case 'status':
      return await getStatus(env);

    case 'generate-article': {
      // Note: This doesn't have access to ExecutionContext from MCP calls
      // Background tasks (ctx.waitUntil) won't work for MCP-triggered articles
      // This is a known limitation - MCP calls are foreground only
      const stubCtx = {
        waitUntil: (promise: Promise<unknown>) => {
          promise.catch((e) => console.error('Background task failed:', e));
        },
        passThroughOnException: () => {},
      } as ExecutionContext;

      return await generateArticle(args as never, env, stubCtx);
    }

    case 'get-history':
      return await getHistory(args as never, env);

    case 'get-metrics':
      return await getMetrics(args as never, env);

    case 'task-list':
      return await listTasks(env);

    case 'task-create':
      return await createTask(args as never, env);

    case 'task-toggle':
      return await toggleTask(args as never, env);

    case 'task-delete':
      return await deleteTask(args as never, env);

    case 'task-logs':
      return await getTaskLogs(
        (args as { taskId: string }).taskId,
        ((args as { limit?: number }).limit ?? 50),
        env
      );

    case 'provider-health':
      return await getProviderHealth(env);

    case 'dlq-list':
      return await getDLQEntries((args as { limit?: number }).limit ?? 50, env);

    case 'dlq-clear':
      return await clearDLQEntries(args as never, env);

    case 'analytics':
      return await getAnalyticsOverview((args as { days?: number }).days ?? 7, env);

    case 'db-query':
      return await executeDbQuery(args as never, env);

    case 'db-execute':
      return await executeDbWrite(args as never, env);

    case 'kv-list':
      return await listKvKeys(args as never, env);

    case 'kv-get':
      return await getKvValue(args as never, env);

    case 'kv-put':
      return await putKvValue(args as never, env);

    case 'kv-delete':
      return await deleteKvValue(args as never, env);

    case 'discord-send-message':
      return await sendDiscordMessage(args as never, env);

    case 'discord-api-request':
      return await executeDiscordApi(args as never, env);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Helper to create error responses
 */
function errorResponse(
  status: number,
  message: string,
  code: number
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    }
  );
}
