/**
 * Agentic Coding Loop
 *
 * This is the main orchestration class that implements the agentic coding loop.
 * It handles:
 * - Streaming AI responses
 * - Parsing operations from responses
 * - Applying file changes
 * - Auto-fix loops for errors
 * - Continuation for truncated responses
 *
 * ## How it works:
 *
 * 1. User sends a prompt
 * 2. System constructs context (codebase files, history, system prompt)
 * 3. AI generates a streaming response with embedded tags
 * 4. Tags are parsed to extract file operations
 * 5. Operations are validated (dry-run for search-replace)
 * 6. If issues detected, AI is asked to fix them (auto-fix loop)
 * 7. File operations are applied to the filesystem
 * 8. Changes are committed to git (optional)
 *
 * ## Usage:
 *
 * ```typescript
 * import { CodingLoop, CodingLoopConfig } from './coding-loop';
 *
 * const config: CodingLoopConfig = {
 *   chatMode: 'build',
 *   enableAutoFix: true,
 *   maxAutoFixAttempts: 2,
 * };
 *
 * const loop = new CodingLoop(config);
 *
 * // Process a user prompt
 * const result = await loop.process({
 *   prompt: 'Add a dark mode toggle',
 *   appPath: '/path/to/app',
 *   messageHistory: [...],
 *   codebaseFiles: [...],
 *   streamText: yourStreamingFunction,
 * });
 *
 * // Apply the changes
 * if (result.parsedResponse) {
 *   await loop.applyChanges({
 *     appPath: '/path/to/app',
 *     parsedResponse: result.parsedResponse,
 *   });
 * }
 * ```
 */

import type {
  CodingLoopConfig,
  Message,
  CodebaseFile,
  ParsedResponse,
  FileOperationResult,
  ResponseChunkCallback,
  StreamEventCallback,
} from "./types";
import {
  parseResponse,
  hasUnclosedWriteTag,
  removeNonEssentialTags,
  escapeDyadTags,
} from "./tag-parser";
import { constructSystemPrompt, createCodebasePrompt } from "./prompts";
import { applyFileChanges, generateChangeSummary } from "./file-operations";

/**
 * Streaming function type that matches the Vercel AI SDK
 */
export interface StreamTextFunction {
  (options: {
    messages: Message[];
    system: string;
    abortSignal?: AbortSignal;
  }): Promise<{
    fullStream: AsyncIterable<{
      type: string;
      text?: string;
    }>;
  }>;
}

/**
 * Options for processing a prompt
 */
export interface ProcessOptions {
  /**
   * The user's prompt
   */
  prompt: string;

  /**
   * Path to the application/project
   */
  appPath: string;

  /**
   * Previous message history
   */
  messageHistory: Message[];

  /**
   * Codebase files for context
   */
  codebaseFiles: CodebaseFile[];

  /**
   * Function to stream AI responses
   */
  streamText: StreamTextFunction;

  /**
   * Abort signal for cancellation
   */
  abortSignal?: AbortSignal;

  /**
   * Callback for response chunks during streaming
   */
  onChunk?: ResponseChunkCallback;

  /**
   * Callback for stream events
   */
  onEvent?: StreamEventCallback;
}

/**
 * Result of processing a prompt
 */
export interface ProcessResult {
  /**
   * The full AI response
   */
  fullResponse: string;

  /**
   * Parsed operations from the response
   */
  parsedResponse: ParsedResponse;

  /**
   * Whether the response was truncated
   */
  wasTruncated: boolean;

  /**
   * Number of auto-fix attempts made
   */
  autoFixAttempts: number;

  /**
   * Whether the stream was aborted
   */
  wasAborted: boolean;
}

/**
 * The main Agentic Coding Loop class
 */
export class CodingLoop {
  private config: CodingLoopConfig;

  constructor(config: CodingLoopConfig) {
    this.config = {
      enableAutoFix: true,
      maxAutoFixAttempts: 2,
      maxContinuationAttempts: 2,
      enableThinking: true,
      dbSaveInterval: 150,
      ...config,
    };
  }

  /**
   * Process a user prompt through the coding loop
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    const {
      prompt,
      appPath,
      messageHistory,
      codebaseFiles,
      streamText,
      abortSignal,
      onChunk,
      onEvent,
    } = options;

    let fullResponse = "";
    let wasAborted = false;
    let autoFixAttempts = 0;

    // Construct the system prompt
    const systemPrompt = constructSystemPrompt({
      chatMode: this.config.chatMode,
      aiRules: this.config.aiRules,
      enableThinking: this.config.enableThinking,
    });

    // Build the codebase context
    const codebaseInfo = this.formatCodebaseFiles(codebaseFiles);
    const codebasePrompt = createCodebasePrompt(codebaseInfo);

    // Build the full message history
    const messages: Message[] = [
      { role: "user", content: codebasePrompt },
      { role: "assistant", content: "OK, got it. I'm ready to help" },
      ...messageHistory,
      { role: "user", content: prompt },
    ];

    try {
      // Stream the AI response
      onEvent?.({ type: "start", chatId: 0 });

      fullResponse = await this.streamResponse({
        messages,
        systemPrompt,
        streamText,
        abortSignal,
        onChunk,
      });

      // Check for truncated response (unclosed dyad-write tag)
      let continuationAttempts = 0;
      while (
        hasUnclosedWriteTag(fullResponse) &&
        continuationAttempts < (this.config.maxContinuationAttempts ?? 2) &&
        !abortSignal?.aborted
      ) {
        continuationAttempts++;

        // Continue the response
        const continuationMessages: Message[] = [
          ...messages,
          { role: "assistant", content: fullResponse },
        ];

        const continuation = await this.streamResponse({
          messages: continuationMessages,
          systemPrompt,
          streamText,
          abortSignal,
          onChunk: async ({ fullResponse: newFull }) => {
            fullResponse = newFull;
            return onChunk?.({ fullResponse, incrementalChunk: "" }) ?? fullResponse;
          },
        });

        fullResponse += continuation;
      }

      // Auto-fix loop (if enabled and in build mode)
      if (
        this.config.enableAutoFix &&
        this.config.chatMode === "build" &&
        !abortSignal?.aborted
      ) {
        const fixResult = await this.runAutoFixLoop({
          fullResponse,
          messages,
          systemPrompt,
          streamText,
          abortSignal,
          onChunk,
        });

        fullResponse = fixResult.fullResponse;
        autoFixAttempts = fixResult.attempts;
      }

      onEvent?.({ type: "end", chatId: 0 });
    } catch (error) {
      if (abortSignal?.aborted) {
        wasAborted = true;
      } else {
        onEvent?.({ type: "error", chatId: 0, data: error });
        throw error;
      }
    }

    return {
      fullResponse,
      parsedResponse: parseResponse(fullResponse),
      wasTruncated: hasUnclosedWriteTag(fullResponse),
      autoFixAttempts,
      wasAborted,
    };
  }

  /**
   * Apply file changes from a parsed response
   */
  async applyChanges(options: {
    appPath: string;
    parsedResponse: ParsedResponse;
    onLog?: (message: string) => void;
    onWarn?: (message: string) => void;
    onError?: (message: string, error?: unknown) => void;
    fileUploadsMap?: Map<string, { filePath: string; originalName: string }>;
  }): Promise<FileOperationResult> {
    return applyFileChanges(options);
  }

  /**
   * Get a summary of changes for commit messages
   */
  getChangeSummary(result: FileOperationResult): string {
    return generateChangeSummary(result);
  }

  /**
   * Format codebase files for inclusion in the prompt
   */
  private formatCodebaseFiles(files: CodebaseFile[]): string {
    return files
      .map(
        (file) => `<dyad-file path="${file.path}">
${file.content}
</dyad-file>`
      )
      .join("\n\n");
  }

  /**
   * Stream an AI response
   */
  private async streamResponse(options: {
    messages: Message[];
    systemPrompt: string;
    streamText: StreamTextFunction;
    abortSignal?: AbortSignal;
    onChunk?: ResponseChunkCallback;
  }): Promise<string> {
    const { messages, systemPrompt, streamText, abortSignal, onChunk } = options;

    let fullResponse = "";
    let inThinkingBlock = false;

    const { fullStream } = await streamText({
      messages,
      system: systemPrompt,
      abortSignal,
    });

    for await (const part of fullStream) {
      if (abortSignal?.aborted) {
        break;
      }

      let chunk = "";

      // Handle thinking block transitions
      if (
        inThinkingBlock &&
        !["reasoning-delta", "reasoning-end", "reasoning-start"].includes(part.type)
      ) {
        chunk = "</think>";
        inThinkingBlock = false;
      }

      if (part.type === "text-delta" && part.text) {
        chunk += part.text;
      } else if (part.type === "reasoning-delta" && part.text) {
        if (!inThinkingBlock) {
          chunk = "<think>";
          inThinkingBlock = true;
        }
        chunk += escapeDyadTags(part.text);
      }

      if (!chunk) {
        continue;
      }

      fullResponse += chunk;

      if (onChunk) {
        fullResponse = await onChunk({
          fullResponse,
          incrementalChunk: chunk,
        });
      }
    }

    return fullResponse;
  }

  /**
   * Run the auto-fix loop for detected issues
   */
  private async runAutoFixLoop(options: {
    fullResponse: string;
    messages: Message[];
    systemPrompt: string;
    streamText: StreamTextFunction;
    abortSignal?: AbortSignal;
    onChunk?: ResponseChunkCallback;
  }): Promise<{ fullResponse: string; attempts: number }> {
    const { messages, systemPrompt, streamText, abortSignal, onChunk } = options;
    let { fullResponse } = options;

    // For now, return without auto-fix since we don't have the problem detection
    // infrastructure extracted yet. In a full implementation, you would:
    // 1. Run type checking on the modified files
    // 2. Collect errors
    // 3. Ask the AI to fix them
    // 4. Repeat until no errors or max attempts reached

    return { fullResponse, attempts: 0 };
  }
}

/**
 * Create a coding loop with default configuration
 */
export function createCodingLoop(
  config: Partial<CodingLoopConfig> & { chatMode: CodingLoopConfig["chatMode"] }
): CodingLoop {
  return new CodingLoop({
    enableAutoFix: true,
    maxAutoFixAttempts: 2,
    maxContinuationAttempts: 2,
    enableThinking: true,
    ...config,
  });
}
