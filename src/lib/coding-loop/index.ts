/**
 * Agentic Coding Loop Library
 *
 * A reusable implementation of the agentic coding loop pattern for
 * AI-assisted code generation and modification.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createCodingLoop, parseResponse, applyFileChanges } from './coding-loop';
 *
 * // Create a coding loop instance
 * const loop = createCodingLoop({ chatMode: 'build' });
 *
 * // Process a prompt
 * const result = await loop.process({
 *   prompt: 'Add a login form',
 *   appPath: '/path/to/app',
 *   messageHistory: [],
 *   codebaseFiles: [...],
 *   streamText: yourAIStreamFunction,
 * });
 *
 * // Apply changes to filesystem
 * await loop.applyChanges({
 *   appPath: '/path/to/app',
 *   parsedResponse: result.parsedResponse,
 * });
 * ```
 *
 * ## Architecture
 *
 * The coding loop works in these phases:
 *
 * 1. **Context Building**: Collects codebase files and message history
 * 2. **Prompt Construction**: Builds system prompt based on chat mode
 * 3. **AI Streaming**: Streams response from the AI model
 * 4. **Tag Parsing**: Extracts operations from XML-like tags in response
 * 5. **Validation**: Dry-runs operations to detect issues
 * 6. **Auto-fix Loop**: Asks AI to fix detected issues (optional)
 * 7. **Application**: Applies file operations to filesystem
 * 8. **Commit**: Commits changes to git (optional)
 *
 * @module coding-loop
 */

// Main coding loop class and factory
export { CodingLoop, createCodingLoop } from "./coding-loop";
export type {
  StreamTextFunction,
  ProcessOptions,
  ProcessResult,
} from "./coding-loop";

// Tag parsing utilities
export {
  parseResponse,
  getWriteTags,
  getRenameTags,
  getDeletePaths,
  getAddDependencyPackages,
  getSearchReplaceTags,
  getSqlQueryTags,
  getCommandTags,
  getChatSummary,
  hasUnclosedWriteTag,
  removeDyadTags,
  removeThinkingTags,
  removeProblemReportTags,
  removeNonEssentialTags,
  escapeDyadTags,
} from "./tag-parser";

// File operations
export {
  applyFileChanges,
  safeJoin,
  fileExists,
  readFile,
  ensureDirectory,
  generateChangeSummary,
} from "./file-operations";
export type { ApplyFileChangesOptions } from "./file-operations";

// System prompts
export {
  constructSystemPrompt,
  createCodebasePrompt,
  createOtherAppsCodebasePrompt,
  THINKING_PROMPT,
  BUILD_SYSTEM_PREFIX,
  BUILD_SYSTEM_POSTFIX,
  DEFAULT_AI_RULES,
  ASK_MODE_SYSTEM_PROMPT,
  AGENT_MODE_SYSTEM_PROMPT,
} from "./prompts";

// Types
export type {
  WriteTag,
  RenameTag,
  CodebaseFile,
  Message,
  ChatMode,
  CodingLoopConfig,
  FileOperationResult,
  StreamChunkType,
  ResponseChunkCallback,
  StreamEventCallback,
  StreamTextOptions,
  ApplyChangesOptions,
  SearchReplaceTag,
  SqlQueryTag,
  CommandType,
  ParsedResponse,
} from "./types";
