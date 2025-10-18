import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'error';
  tool: string;
  durationMs: number;
  message: string;
  stack?: string;
  args?: unknown;
}

const DEFAULT_LOG_FILE = process.env.MCP_TOOL_LOG_FILE || 'logs/mcp-tools.log';

export function appendJsonLine(entry: LogEntry, file?: string): void {
  const logFile = file ?? DEFAULT_LOG_FILE;
  const logLine = JSON.stringify(entry) + '\n';

  void (async () => {
    try {
      await mkdir(dirname(logFile), { recursive: true });
      await appendFile(logFile, logLine);
    } catch (error) {
      console.error('Log write failed:', error);
    }
  })();
}
