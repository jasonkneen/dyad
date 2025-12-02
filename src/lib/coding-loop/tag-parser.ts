/**
 * Tag Parser - Extracts operations from AI responses
 *
 * The coding loop uses XML-like tags embedded in AI responses to specify
 * file operations. This module provides utilities to parse these tags.
 *
 * Supported tags:
 * - <dyad-write path="..." description="...">content</dyad-write>
 * - <dyad-rename from="..." to="..."></dyad-rename>
 * - <dyad-delete path="..."></dyad-delete>
 * - <dyad-add-dependency packages="pkg1 pkg2"></dyad-add-dependency>
 * - <dyad-search-replace path="..." description="...">content</dyad-search-replace>
 * - <dyad-execute-sql description="...">query</dyad-execute-sql>
 * - <dyad-command type="rebuild|restart|refresh"></dyad-command>
 * - <dyad-chat-summary>summary</dyad-chat-summary>
 */

import type {
  WriteTag,
  RenameTag,
  SearchReplaceTag,
  SqlQueryTag,
  CommandType,
  ParsedResponse,
} from "./types";

/**
 * Normalize file paths to use forward slashes
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Remove markdown code fences from content if present
 */
function stripCodeFences(content: string): string {
  const lines = content.split("\n");
  if (lines[0]?.startsWith("```")) {
    lines.shift();
  }
  if (lines[lines.length - 1]?.startsWith("```")) {
    lines.pop();
  }
  return lines.join("\n");
}

/**
 * Extract all <dyad-write> tags from the response
 */
export function getWriteTags(fullResponse: string): WriteTag[] {
  const regex = /<dyad-write([^>]*)>([\s\S]*?)<\/dyad-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  const tags: WriteTag[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    const content = stripCodeFences(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch?.[1]) {
      tags.push({
        path: normalizePath(pathMatch[1]),
        content,
        description: descriptionMatch?.[1],
      });
    }
  }

  return tags;
}

/**
 * Extract all <dyad-rename> tags from the response
 */
export function getRenameTags(fullResponse: string): RenameTag[] {
  const regex =
    /<dyad-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/dyad-rename>/g;
  const tags: RenameTag[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(match[1]),
      to: normalizePath(match[2]),
    });
  }

  return tags;
}

/**
 * Extract all <dyad-delete> tags from the response
 */
export function getDeletePaths(fullResponse: string): string[] {
  const regex = /<dyad-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/dyad-delete>/g;
  const paths: string[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(match[1]));
  }

  return paths;
}

/**
 * Extract all <dyad-add-dependency> tags from the response
 */
export function getAddDependencyPackages(fullResponse: string): string[] {
  const regex =
    /<dyad-add-dependency packages="([^"]+)">[^<]*<\/dyad-add-dependency>/g;
  const packages: string[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    packages.push(...match[1].split(" ").filter(Boolean));
  }

  return packages;
}

/**
 * Extract all <dyad-search-replace> tags from the response
 */
export function getSearchReplaceTags(fullResponse: string): SearchReplaceTag[] {
  const regex = /<dyad-search-replace([^>]*)>([\s\S]*?)<\/dyad-search-replace>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  const tags: SearchReplaceTag[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    const content = stripCodeFences(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch?.[1]) {
      tags.push({
        path: normalizePath(pathMatch[1]),
        content,
        description: descriptionMatch?.[1],
      });
    }
  }

  return tags;
}

/**
 * Extract all <dyad-execute-sql> tags from the response
 */
export function getSqlQueryTags(fullResponse: string): SqlQueryTag[] {
  const regex = /<dyad-execute-sql([^>]*)>([\s\S]*?)<\/dyad-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;

  const queries: SqlQueryTag[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    const content = stripCodeFences(match[2].trim());
    const descriptionMatch = descriptionRegex.exec(attributesString);

    queries.push({
      content,
      description: descriptionMatch?.[1],
    });
  }

  return queries;
}

/**
 * Extract all <dyad-command> tags from the response
 */
export function getCommandTags(fullResponse: string): CommandType[] {
  const regex = /<dyad-command type="([^"]+)"[^>]*><\/dyad-command>/g;
  const commands: CommandType[] = [];
  let match;

  while ((match = regex.exec(fullResponse)) !== null) {
    const type = match[1] as CommandType;
    if (["rebuild", "restart", "refresh"].includes(type)) {
      commands.push(type);
    }
  }

  return commands;
}

/**
 * Extract the <dyad-chat-summary> tag from the response
 */
export function getChatSummary(fullResponse: string): string | null {
  const regex = /<dyad-chat-summary>([\s\S]*?)<\/dyad-chat-summary>/g;
  const match = regex.exec(fullResponse);
  return match?.[1]?.trim() ?? null;
}

/**
 * Parse all tags from the AI response
 */
export function parseResponse(fullResponse: string): ParsedResponse {
  return {
    writeTags: getWriteTags(fullResponse),
    renameTags: getRenameTags(fullResponse),
    deletePaths: getDeletePaths(fullResponse),
    addDependencies: getAddDependencyPackages(fullResponse),
    searchReplaceTags: getSearchReplaceTags(fullResponse),
    sqlQueries: getSqlQueryTags(fullResponse),
    commands: getCommandTags(fullResponse),
    chatSummary: getChatSummary(fullResponse),
  };
}

/**
 * Check if the response has an unclosed <dyad-write> tag
 * Used to detect truncated responses that need continuation
 */
export function hasUnclosedWriteTag(text: string): boolean {
  const openRegex = /<dyad-write[^>]*>/g;
  let lastOpenIndex = -1;
  let match;

  while ((match = openRegex.exec(text)) !== null) {
    lastOpenIndex = match.index;
  }

  if (lastOpenIndex === -1) {
    return false;
  }

  const textAfterLastOpen = text.substring(lastOpenIndex);
  return !/<\/dyad-write>/.test(textAfterLastOpen);
}

/**
 * Remove all dyad tags from text (useful for ask mode)
 */
export function removeDyadTags(text: string): string {
  return text.replace(/<dyad-[^>]*>[\s\S]*?<\/dyad-[^>]*>/g, "").trim();
}

/**
 * Remove thinking tags from text
 */
export function removeThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Remove problem report tags from text
 */
export function removeProblemReportTags(text: string): string {
  return text
    .replace(/<dyad-problem-report[^>]*>[\s\S]*?<\/dyad-problem-report>/g, "")
    .trim();
}

/**
 * Remove non-essential tags (thinking, problem reports) from text
 */
export function removeNonEssentialTags(text: string): string {
  return removeProblemReportTags(removeThinkingTags(text));
}

/**
 * Escape dyad tags in content to prevent misinterpretation
 * Uses full-width less-than sign (＜) as a visual lookalike
 */
export function escapeDyadTags(text: string): string {
  return text.replace(/<dyad/g, "＜dyad").replace(/<\/dyad/g, "＜/dyad");
}
