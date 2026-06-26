import type { Env } from '../types/env';

export type UserRole = 'admin' | 'user' | 'public';

export interface AuthResult {
  ok: boolean;
  role: UserRole;
  error?: string;
}

/**
 * Check MCP authentication via x-mcp-secret header
 * Fail closed: if no secret configured, return unauthorized
 */
export function checkAuth(request: Request, env: Env): AuthResult {
  // Fail closed if MCP_SECRET not configured
  if (!env.MCP_SECRET) {
    return {
      ok: false,
      role: 'public',
      error: 'MCP endpoint not configured',
    };
  }

  const secret = request.headers.get('x-mcp-secret');

  if (!secret) {
    return {
      ok: false,
      role: 'public',
      error: 'Missing x-mcp-secret header',
    };
  }

  if (secret !== env.MCP_SECRET) {
    return {
      ok: false,
      role: 'public',
      error: 'Invalid secret',
    };
  }

  // Successfully authenticated
  // For now, all authenticated users are 'user' role
  // Future: check additional header for admin elevation
  return {
    ok: true,
    role: 'user',
  };
}
