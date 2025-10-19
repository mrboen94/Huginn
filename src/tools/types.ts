import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolArguments = Record<string, unknown>;

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: ToolArguments, signal: AbortSignal) => Promise<CallToolResult>;
}

export interface ToolListItem {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const EMPTY_TOOL_ARGS: ToolArguments = {};
