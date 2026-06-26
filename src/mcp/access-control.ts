import type { UserRole } from './auth';

export type ToolPermission = 'public' | 'user' | 'admin';

/**
 * Tool permission map - defines minimum role required for each tool
 */
export const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // Public tools (no auth required)
  status: 'public',
  health: 'public',

  // User tools (requires authentication)
  'ai-chat': 'user',
  'generate-article': 'user',
  'discord-send-message': 'user',
  'discord-api-request': 'user',
  'send-message': 'user',
  'purge-channel': 'user',
  'get-history': 'user',
  'get-metrics': 'user',
  'composio-status': 'user',
  'composio-post': 'user',
  'composio-broadcast': 'user',

  // Admin tools (requires admin role)
  'task-list': 'admin',
  'task-create': 'admin',
  'task-toggle': 'admin',
  'task-delete': 'admin',
  'provider-health': 'admin',
  'clear-dlq': 'admin',
  'ban-user': 'admin',
  'kick-user': 'admin',
  'plugin-list': 'admin',
  'plugin-toggle': 'admin',
};

/**
 * Get permission level required for a tool
 */
export function getToolPermission(toolName: string): ToolPermission {
  return TOOL_PERMISSIONS[toolName] ?? 'admin'; // Default to admin for unknown tools
}

/**
 * Check if a role has permission to use a tool
 */
export function hasPermission(role: UserRole, required: ToolPermission): boolean {
  const roleLevel = { public: 0, user: 1, admin: 2 }[role];
  const requiredLevel = { public: 0, user: 1, admin: 2 }[required];

  return roleLevel >= requiredLevel;
}

/**
 * Get list of available tools for a role
 */
export function getAvailableTools(role: UserRole): string[] {
  return Object.entries(TOOL_PERMISSIONS)
    .filter(([, permission]) => hasPermission(role, permission))
    .map(([tool]) => tool);
}
