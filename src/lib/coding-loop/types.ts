/**
 * Core types for the reusable agentic coding loop
 */

/**
 * Represents a file write operation parsed from AI response
 */
export interface WriteTag {
  path: string;
  content: string;
  description?: string;
}

/**
 * Represents a file rename operation parsed from AI response
 */
export interface RenameTag {
  from: string;
  to: string;
}

/**
 * Represents a file in the codebase context
 */
export interface CodebaseFile {
  path: string;
  content: string;
  focused?: boolean;
  force?: boolean;
}

/**
 * Represents a message in the conversation
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  sourceCommitHash?: string;
}

/**
 * Chat mode determines how the AI responds
 * - build: Actively modifies codebase with file operations
 * - ask: Provides explanations without code generation
 * - agent: Uses tools and MCP for extended capabilities
 */
export type ChatMode = "build" | "ask" | "agent";

/**
 * Configuration for the coding loop
 */
export interface CodingLoopConfig {
  /**
   * The current chat mode
   */
  chatMode: ChatMode;

  /**
   * Enable turbo edits v2 (search-replace operations)
   */
  enableTurboEditsV2?: boolean;

  /**
   * Enable auto-fix for detected problems
   */
  enableAutoFix?: boolean;

  /**
   * Maximum number of auto-fix attempts
   */
  maxAutoFixAttempts?: number;

  /**
   * Maximum number of continuation attempts for unclosed tags
   */
  maxContinuationAttempts?: number;

  /**
   * Custom AI rules to inject into the system prompt
   */
  aiRules?: string;

  /**
   * Enable thinking process in AI responses
   */
  enableThinking?: boolean;

  /**
   * Database save interval in milliseconds
   */
  dbSaveInterval?: number;
}

/**
 * Result of processing file operations
 */
export interface FileOperationResult {
  writtenFiles: string[];
  renamedFiles: string[];
  deletedFiles: string[];
  addedPackages: string[];
  hasChanges: boolean;
  error?: string;
}

/**
 * Stream chunk event types
 */
export type StreamChunkType =
  | "text-delta"
  | "reasoning-delta"
  | "reasoning-start"
  | "reasoning-end"
  | "tool-call"
  | "tool-result";

/**
 * Callback for processing response chunks during streaming
 */
export type ResponseChunkCallback = (params: {
  fullResponse: string;
  incrementalChunk: string;
}) => Promise<string>;

/**
 * Callback for handling stream events
 */
export type StreamEventCallback = (event: {
  type: "start" | "chunk" | "end" | "error";
  chatId: number;
  data?: unknown;
}) => void;

/**
 * Options for the streaming text function
 */
export interface StreamTextOptions {
  messages: Message[];
  systemPrompt: string;
  files: CodebaseFile[];
  abortSignal?: AbortSignal;
  onChunk?: ResponseChunkCallback;
  onEvent?: StreamEventCallback;
}

/**
 * Options for applying file changes
 */
export interface ApplyChangesOptions {
  fullResponse: string;
  appPath: string;
  commitMessage?: string;
  autoCommit?: boolean;
}

/**
 * Search-replace operation for turbo edits
 */
export interface SearchReplaceTag {
  path: string;
  content: string;
  description?: string;
}

/**
 * SQL query execution tag
 */
export interface SqlQueryTag {
  content: string;
  description?: string;
}

/**
 * Command tag for triggering UI actions
 */
export type CommandType = "rebuild" | "restart" | "refresh";

/**
 * Parsed response containing all extracted operations
 */
export interface ParsedResponse {
  writeTags: WriteTag[];
  renameTags: RenameTag[];
  deletePaths: string[];
  addDependencies: string[];
  searchReplaceTags: SearchReplaceTag[];
  sqlQueries: SqlQueryTag[];
  commands: CommandType[];
  chatSummary: string | null;
}
