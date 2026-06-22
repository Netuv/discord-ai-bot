/**
 * server.ts — MCP SSE Server for Cloudflare Workers
 * v5.0 — Streamable HTTP transport, JSON-RPC tool execution
 */

import { getTool, getAllTools, registerTool, registerTools, getToolNames } from './registry';
import type { ToolDefinition } from './registry';
import { logger } from '../core/logger';

export { registerTool, registerTools };

interface Session { id: string; createdAt: number; }
const sessions = new Map<string, Session>();
function generateSessionId(): string { return crypto.randomUUID(); }
function createSession(): Session { const s: Session = { id: generateSessionId(), createdAt: Date.now() }; sessions.set(s.id, s); return s; }
function getSession(id: string): Session | undefined { return sessions.get(id); }

const CORS_HEADERS: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization', 'Access-Control-Max-Age': '86400' };

interface JsonRpcRequest { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown>; }
interface JsonRpcResponse { jsonrpc: string; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown }; }

function sseEvent(event: string, data: string): string { return `event: ${event}\ndata: ${data}\n\n`; }
function jsonEvent(data: unknown): string { return `data: ${JSON.stringify(data)}\n\n`; }

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}
function corsResponse(status = 204): Response { return new Response(null, { status, headers: CORS_HEADERS }); }

function buildToolListPayload(): unknown[] {
	return Object.entries(getAllTools()).map(([name, def]) => ({ name, description: def.description, inputSchema: def.inputSchema }));
}

async function handleJsonRpc(body: JsonRpcRequest): Promise<JsonRpcResponse> {
	const { jsonrpc, id, method, params } = body;
	if (!id) return { jsonrpc, id: null, error: { code: -32600, message: 'Missing request ID' } };
	if (method === 'ping') return { jsonrpc, id, result: 'pong' };
	if (method === 'list_tools' || method === 'tools/list') return { jsonrpc, id, result: { tools: buildToolListPayload() } };

	const toolName = method.startsWith('tools/') ? method.slice('tools/'.length) : method;
	const tool = getTool(toolName);
	if (!tool) return { jsonrpc, id, error: { code: -32601, message: `Tool not found: ${toolName}` } };

	try {
		const result = await tool.handler(params || {});
		return { jsonrpc, id, result: { content: result.content } };
	} catch (e) {
		logger.error('McpServer', 'Tool execution error', { tool: toolName, error: e instanceof Error ? e.message : String(e) });
		return { jsonrpc, id, error: { code: -32603, message: 'Tool execution error' } };
	}
}

export async function handleMcpRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const method = request.method;

	if (method === 'OPTIONS') return corsResponse();

	const acceptHeader = request.headers.get('Accept') || '';
	const isSseRequest = acceptHeader.includes('text/event-stream') || url.pathname === '/mcp' || url.pathname === '/';

	if (method === 'GET' && !isSseRequest) {
		return jsonResponse({ ok: true, server: 'discord-ai-bot-mcp', version: '5.0.0', tools: getToolNames(), sessionsActive: sessions.size });
	}

	if ((method === 'GET' && isSseRequest) || (method === 'GET' && url.pathname === '/mcp')) {
		const session = createSession();
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseEvent('endpoint', `/mcp?sessionId=${session.id}`)));
				const toolsPayload = { jsonrpc: '2.0', id: null, result: { tools: buildToolListPayload() } };
				controller.enqueue(encoder.encode(jsonEvent(toolsPayload)));
			},
		});
		return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS_HEADERS } });
	}

	if (method === 'POST') {
		try {
			const body = await request.json() as JsonRpcRequest;

			// If POST has no session ID in query but has method list_tools, handle directly
			if (body.method === 'list_tools' || body.method === 'tools/list') {
				return jsonResponse(await handleJsonRpc(body));
			}

			const response = await handleJsonRpc(body);
			return jsonResponse(response, response.error ? 400 : 200);
		} catch (e) {
			logger.error('McpServer', 'POST handling error', { error: e instanceof Error ? e.message : String(e) });
			return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
		}
	}

	return jsonResponse({ error: 'Method not allowed' }, 405);
}
