import type { FormatPlugin } from './types';
import { traceLog } from '../core/trace-logger';

const BUILT_IN_FORMAT_PLUGINS: Record<string, FormatPlugin> = {
  // Built-in format plugins can be mapped here
};

const EXTERNAL_FORMAT_PLUGINS: Record<string, FormatPlugin> = {
  // Akan diisi oleh plugin developer
};

export function getAllFormatPlugins(): Record<string, FormatPlugin> {
  return { ...BUILT_IN_FORMAT_PLUGINS, ...EXTERNAL_FORMAT_PLUGINS };
}

export function registerFormatPlugin(plugin: FormatPlugin): void {
  if (EXTERNAL_FORMAT_PLUGINS[plugin.id]) {
    traceLog('warn', 'PluginRegistry', `Overwriting plugin: ${plugin.id}`);
  }
  EXTERNAL_FORMAT_PLUGINS[plugin.id] = plugin;
  traceLog('info', 'PluginRegistry', `Registered format plugin: ${plugin.id} v${plugin.version}`);
}
