/**
 * File Operations Handler
 *
 * Applies parsed file operations (write, rename, delete) to the filesystem.
 * This module handles the actual file system modifications after parsing
 * the AI response.
 */

import fs from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import type {
  WriteTag,
  RenameTag,
  FileOperationResult,
  ParsedResponse,
} from "./types";

/**
 * Safely join paths, preventing directory traversal attacks
 */
export function safeJoin(basePath: string, relativePath: string): string {
  const normalizedBase = path.resolve(basePath);
  const joined = path.resolve(normalizedBase, relativePath);

  if (!joined.startsWith(normalizedBase)) {
    throw new Error(
      `Path traversal attempt detected: ${relativePath} escapes ${basePath}`
    );
  }

  return joined;
}

/**
 * Options for applying file changes
 */
export interface ApplyFileChangesOptions {
  /**
   * Base path of the application/project
   */
  appPath: string;

  /**
   * Parsed response containing all operations
   */
  parsedResponse: ParsedResponse;

  /**
   * Optional callback for logging operations
   */
  onLog?: (message: string) => void;

  /**
   * Optional callback for logging warnings
   */
  onWarn?: (message: string) => void;

  /**
   * Optional callback for logging errors
   */
  onError?: (message: string, error?: unknown) => void;

  /**
   * Optional map of file ID placeholders to actual file content
   * Used for handling file uploads
   */
  fileUploadsMap?: Map<string, { filePath: string; originalName: string }>;
}

/**
 * Apply all file operations from a parsed response
 *
 * Operations are applied in this order:
 * 1. Deletes (to avoid path conflicts)
 * 2. Renames (LLMs often rename then edit)
 * 3. Writes (creates/updates files)
 */
export async function applyFileChanges(
  options: ApplyFileChangesOptions
): Promise<FileOperationResult> {
  const {
    appPath,
    parsedResponse,
    onLog = console.log,
    onWarn = console.warn,
    onError = console.error,
    fileUploadsMap,
  } = options;

  const writtenFiles: string[] = [];
  const renamedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const errors: { message: string; error?: unknown }[] = [];

  try {
    // 1. Process all file deletions first
    for (const filePath of parsedResponse.deletePaths) {
      try {
        const fullFilePath = safeJoin(appPath, filePath);

        if (fs.existsSync(fullFilePath)) {
          const stats = fs.lstatSync(fullFilePath);
          if (stats.isDirectory()) {
            fs.rmdirSync(fullFilePath, { recursive: true });
          } else {
            fs.unlinkSync(fullFilePath);
          }
          onLog(`Successfully deleted: ${filePath}`);
          deletedFiles.push(filePath);
        } else {
          onWarn(`File to delete does not exist: ${filePath}`);
        }
      } catch (error) {
        onError(`Failed to delete: ${filePath}`, error);
        errors.push({ message: `Failed to delete: ${filePath}`, error });
      }
    }

    // 2. Process all file renames
    for (const tag of parsedResponse.renameTags) {
      try {
        const fromPath = safeJoin(appPath, tag.from);
        const toPath = safeJoin(appPath, tag.to);

        // Ensure target directory exists
        const dirPath = path.dirname(toPath);
        fs.mkdirSync(dirPath, { recursive: true });

        if (fs.existsSync(fromPath)) {
          fs.renameSync(fromPath, toPath);
          onLog(`Successfully renamed: ${tag.from} -> ${tag.to}`);
          renamedFiles.push(tag.to);
        } else {
          onWarn(`Source file for rename does not exist: ${tag.from}`);
        }
      } catch (error) {
        onError(`Failed to rename: ${tag.from} -> ${tag.to}`, error);
        errors.push({
          message: `Failed to rename: ${tag.from} -> ${tag.to}`,
          error,
        });
      }
    }

    // 3. Process all file writes
    for (const tag of parsedResponse.writeTags) {
      try {
        const fullFilePath = safeJoin(appPath, tag.path);
        let content: string | Buffer = tag.content;

        // Check if content matches a file upload placeholder
        if (fileUploadsMap) {
          const trimmedContent = tag.content.trim();
          const fileInfo = fileUploadsMap.get(trimmedContent);
          if (fileInfo) {
            content = await fsAsync.readFile(fileInfo.filePath);
            onLog(
              `Replaced file ID ${trimmedContent} with content from ${fileInfo.originalName}`
            );
          }
        }

        // Ensure directory exists
        const dirPath = path.dirname(fullFilePath);
        fs.mkdirSync(dirPath, { recursive: true });

        // Write file content
        fs.writeFileSync(fullFilePath, content);
        onLog(`Successfully wrote: ${tag.path}`);
        writtenFiles.push(tag.path);
      } catch (error) {
        onError(`Failed to write: ${tag.path}`, error);
        errors.push({ message: `Failed to write: ${tag.path}`, error });
      }
    }

    const hasChanges =
      writtenFiles.length > 0 ||
      renamedFiles.length > 0 ||
      deletedFiles.length > 0;

    return {
      writtenFiles,
      renamedFiles,
      deletedFiles,
      addedPackages: parsedResponse.addDependencies,
      hasChanges,
      error:
        errors.length > 0
          ? errors.map((e) => e.message).join("; ")
          : undefined,
    };
  } catch (error) {
    return {
      writtenFiles,
      renamedFiles,
      deletedFiles,
      addedPackages: parsedResponse.addDependencies,
      hasChanges: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsAsync.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file with optional caching
 */
export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fsAsync.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fsAsync.mkdir(dirPath, { recursive: true });
}

/**
 * Generate a summary of file changes for commit messages
 */
export function generateChangeSummary(result: FileOperationResult): string {
  const parts: string[] = [];

  if (result.writtenFiles.length > 0) {
    parts.push(`wrote ${result.writtenFiles.length} file(s)`);
  }
  if (result.renamedFiles.length > 0) {
    parts.push(`renamed ${result.renamedFiles.length} file(s)`);
  }
  if (result.deletedFiles.length > 0) {
    parts.push(`deleted ${result.deletedFiles.length} file(s)`);
  }
  if (result.addedPackages.length > 0) {
    parts.push(`added ${result.addedPackages.join(", ")} package(s)`);
  }

  return parts.join(", ");
}
