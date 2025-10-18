import { type LogEntry, appendJsonLine } from './logger.js';

export class TimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool ${toolName} timed out after ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

export interface SafeToolOptions {
  timeoutMs?: number;
  logFile?: string;
  logArgs?: unknown;
  logger?: (entry: LogEntry, file?: string) => void;
}

export async function safeToolExecution(
  toolName: string,
  handler: (
    signal: AbortSignal,
  ) => Promise<{ content: any[]; isError?: boolean }>,
  options?: SafeToolOptions,
): Promise<{ content: any[]; isError?: boolean }> {
  const startTime = Date.now();
  const timeoutMs =
    options?.timeoutMs ??
    (process.env.MCP_TOOL_TIMEOUT_MS
      ? Number(process.env.MCP_TOOL_TIMEOUT_MS)
      : 10000);

  const controller = new AbortController();
  let timeoutHandle: Timer | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError(toolName, timeoutMs));
      }, timeoutMs);
    });

    const result = await Promise.race([
      handler(controller.signal),
      timeoutPromise,
    ]);

    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    const durationMs = Date.now() - startTime;
    const normalizedMessage =
      error instanceof Error ? error.message : 'Unknown error';

    try {
      setTimeout(() => {
        try {
          const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            tool: toolName,
            durationMs,
            message: normalizedMessage,
            stack: error instanceof Error ? error.stack : undefined,
            args: options?.logArgs,
          };

          const logger = options?.logger ?? appendJsonLine;
          logger(logEntry, options?.logFile);
        } catch (logError) {
          console.error('Failed to schedule error logging:', logError);
        }
      }, 0);
    } catch (scheduleError) {
      console.error('Failed to schedule error logging:', scheduleError);
    }

    return {
      content: [
        {
          type: 'text',
          text: `Tool execution failed: ${normalizedMessage}`,
        },
      ],
      isError: true,
    };
  }
}
