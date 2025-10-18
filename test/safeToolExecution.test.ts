import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeToolExecution,
  TimeoutError,
} from '../src/utils/safeToolExecution.js';

describe('safeToolExecution', () => {
  let mockLogger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = vi.fn();
  });

  it('should return handler result on success without logging', async () => {
    const handler = async () => ({
      content: [{ type: 'text', text: 'Success!' }],
    });

    const result = await safeToolExecution('test-tool', handler, {
      logger: mockLogger,
    });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Success!' }],
    });
    expect(result.isError).toBeFalsy();
    expect(mockLogger).not.toHaveBeenCalled();
  });

  it('should handle timeout with proper error response and async logging', async () => {
    const handler = async (
      signal: AbortSignal,
    ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ content: [{ type: 'text', text: 'Never reached' }] });
        }, 100);

        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
        });
      });
    };

    const result = await safeToolExecution('test-tool', handler, {
      timeoutMs: 10,
      logger: mockLogger,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Tool execution failed: Tool test-tool timed out after 10 ms'
      },
    ]);

    expect(mockLogger).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        level: 'error',
        tool: 'test-tool',
        durationMs: expect.any(Number),
        message: 'Tool test-tool timed out after 10 ms',
        stack: expect.any(String),
      }),
      undefined,
    );
  });

  it('should handle handler errors with proper error response and async logging', async () => {
    const handler = async (): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
      throw new Error('Test error message');
    };

    const result = await safeToolExecution('test-tool', handler, {
      logArgs: { input: 'test' },
      logger: mockLogger,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Tool execution failed: Test error message'
      },
    ]);

    expect(result.content[0]?.text).not.toContain('at ');

    expect(mockLogger).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        level: 'error',
        tool: 'test-tool',
        durationMs: expect.any(Number),
        message: 'Test error message',
        stack: expect.any(String),
        args: { input: 'test' },
      }),
      undefined,
    );
  });

  it('should handle non-Error exceptions with normalized message', async () => {
    const handler = async () => {
      throw 'String error';
    };

    const result = await safeToolExecution('test-tool', handler, {
      logger: mockLogger,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Tool execution failed: Unknown error'
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unknown error',
        stack: undefined,
      }),
      undefined,
    );
  });

  it('should respect custom timeout from environment variable', async () => {
    const originalEnv = process.env.MCP_TOOL_TIMEOUT_MS;
    process.env.MCP_TOOL_TIMEOUT_MS = '50';

    try {
      const handler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { content: [{ type: 'text', text: 'Never reached' }] };
      };

      const result = await safeToolExecution('test-tool', handler, {
        logger: mockLogger,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain('timed out after 50 ms');
    } finally {
      if (originalEnv !== undefined) {
        process.env.MCP_TOOL_TIMEOUT_MS = originalEnv;
      } else {
        delete process.env.MCP_TOOL_TIMEOUT_MS;
      }
    }
  });

  it('should export TimeoutError for instanceof checks', () => {
    const error = new TimeoutError('test-tool', 1000);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toBe('Tool test-tool timed out after 1000 ms');
    expect(error.name).toBe('TimeoutError');
  });
});
