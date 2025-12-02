# Agentic Coding Loop

A reusable implementation of the agentic coding loop pattern for AI-assisted code generation and modification. This library extracts the core coding loop functionality from Dyad, making it available for use in other applications.

## Overview

The agentic coding loop is a pattern where:

1. **User sends a prompt** → Describe what code changes you want
2. **AI generates response** → With embedded XML-like tags for file operations
3. **Tags are parsed** → Extract file writes, renames, deletes, etc.
4. **Operations are applied** → Modify the filesystem
5. **Auto-fix loop** → If errors detected, AI fixes them automatically

## Installation

This library is part of the Dyad codebase. To use it:

```typescript
import {
  createCodingLoop,
  parseResponse,
  applyFileChanges,
  constructSystemPrompt,
} from "@/lib/coding-loop";
```

## Quick Start

### Basic Usage

```typescript
import { createCodingLoop } from "@/lib/coding-loop";
import { streamText } from "ai"; // Vercel AI SDK

// Create a coding loop instance
const loop = createCodingLoop({
  chatMode: "build",
  enableAutoFix: true,
  maxAutoFixAttempts: 2,
});

// Collect your codebase files
const codebaseFiles = [
  { path: "src/App.tsx", content: "..." },
  { path: "src/components/Button.tsx", content: "..." },
];

// Process a user prompt
const result = await loop.process({
  prompt: "Add a dark mode toggle to the header",
  appPath: "/path/to/your/project",
  messageHistory: [], // Previous conversation messages
  codebaseFiles,
  streamText: async ({ messages, system, abortSignal }) => {
    // Use your preferred AI provider
    return streamText({
      model: yourModel,
      messages,
      system,
      abortSignal,
    });
  },
  onChunk: async ({ fullResponse }) => {
    // Update UI with streaming response
    console.log("Streaming:", fullResponse.slice(-100));
    return fullResponse;
  },
});

// Apply the changes to the filesystem
if (result.parsedResponse.writeTags.length > 0) {
  const fileResult = await loop.applyChanges({
    appPath: "/path/to/your/project",
    parsedResponse: result.parsedResponse,
    onLog: console.log,
    onError: console.error,
  });

  console.log("Changes applied:", loop.getChangeSummary(fileResult));
}
```

## Core Concepts

### Chat Modes

The library supports three chat modes:

- **`build`**: Actively generates and modifies code files
- **`ask`**: Answers questions without generating code
- **`agent`**: Uses external tools before coding (e.g., API research)

```typescript
const buildLoop = createCodingLoop({ chatMode: "build" });
const askLoop = createCodingLoop({ chatMode: "ask" });
const agentLoop = createCodingLoop({ chatMode: "agent" });
```

### Tag System

The AI embeds operations in XML-like tags within its response:

#### File Operations

```xml
<!-- Create or update a file -->
<dyad-write path="src/components/Toggle.tsx" description="Dark mode toggle">
export const Toggle = () => <button>Toggle</button>;
</dyad-write>

<!-- Rename a file -->
<dyad-rename from="src/old.tsx" to="src/new.tsx"></dyad-rename>

<!-- Delete a file -->
<dyad-delete path="src/unused.tsx"></dyad-delete>
```

#### Dependencies

```xml
<!-- Install npm packages (space-separated) -->
<dyad-add-dependency packages="react-hot-toast lucide-react"></dyad-add-dependency>
```

#### Commands

```xml
<!-- Trigger app actions -->
<dyad-command type="rebuild"></dyad-command>
<dyad-command type="restart"></dyad-command>
<dyad-command type="refresh"></dyad-command>
```

#### Metadata

```xml
<!-- Set chat title -->
<dyad-chat-summary>Added dark mode toggle</dyad-chat-summary>
```

### Parsing Responses

You can parse AI responses directly:

```typescript
import { parseResponse, getWriteTags } from "@/lib/coding-loop";

const response = `
I'll add a new Button component.

<dyad-write path="src/Button.tsx" description="New button">
export const Button = () => <button>Click me</button>;
</dyad-write>

<dyad-chat-summary>Added Button component</dyad-chat-summary>
`;

// Parse all operations
const parsed = parseResponse(response);
console.log(parsed.writeTags); // [{ path: "src/Button.tsx", content: "...", description: "..." }]
console.log(parsed.chatSummary); // "Added Button component"

// Or parse specific tags
const writes = getWriteTags(response);
```

### Custom System Prompts

Customize the AI's behavior:

```typescript
import { constructSystemPrompt, DEFAULT_AI_RULES } from "@/lib/coding-loop";

// Use default prompts
const systemPrompt = constructSystemPrompt({
  chatMode: "build",
  enableThinking: true,
});

// Customize AI rules
const customPrompt = constructSystemPrompt({
  chatMode: "build",
  aiRules: `
# Tech Stack
- Use Vue.js instead of React
- Use Vuetify for UI components
- Use Pinia for state management
`,
});
```

## Advanced Usage

### Handling File Uploads

For file upload functionality (e.g., uploading images to the codebase):

```typescript
const fileUploadsMap = new Map([
  ["DYAD_ATTACHMENT_0", { filePath: "/tmp/image.png", originalName: "logo.png" }],
]);

await loop.applyChanges({
  appPath: "/path/to/project",
  parsedResponse: result.parsedResponse,
  fileUploadsMap,
});
```

### Streaming with Real-time Updates

```typescript
const result = await loop.process({
  // ...other options
  onChunk: async ({ fullResponse, incrementalChunk }) => {
    // Update your UI in real-time
    updateChatMessage(fullResponse);

    // Optionally transform the response
    return fullResponse.replace("TODO", "DONE");
  },
  onEvent: (event) => {
    switch (event.type) {
      case "start":
        showLoadingIndicator();
        break;
      case "end":
        hideLoadingIndicator();
        break;
      case "error":
        showError(event.data);
        break;
    }
  },
});
```

### Handling Aborted Streams

```typescript
const abortController = new AbortController();

// Start processing
const resultPromise = loop.process({
  // ...options
  abortSignal: abortController.signal,
});

// User cancels
document.getElementById("cancel").onclick = () => {
  abortController.abort();
};

const result = await resultPromise;
if (result.wasAborted) {
  console.log("Operation was cancelled by user");
  // Partial response is still available in result.fullResponse
}
```

### Detecting Truncated Responses

```typescript
import { hasUnclosedWriteTag } from "@/lib/coding-loop";

const result = await loop.process({
  /* ... */
});

if (result.wasTruncated || hasUnclosedWriteTag(result.fullResponse)) {
  console.log("Response was truncated, may need continuation");
}
```

## Integration Examples

### With Vercel AI SDK

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createCodingLoop } from "@/lib/coding-loop";

const loop = createCodingLoop({ chatMode: "build" });

const result = await loop.process({
  prompt: userMessage,
  appPath: projectPath,
  messageHistory,
  codebaseFiles,
  streamText: async ({ messages, system, abortSignal }) => {
    return streamText({
      model: openai("gpt-4-turbo"),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      system,
      abortSignal,
    });
  },
});
```

### With Anthropic

```typescript
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await loop.process({
  // ...
  streamText: async ({ messages, system, abortSignal }) => {
    return streamText({
      model: anthropic("claude-3-5-sonnet-20241022"),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      system,
      abortSignal,
    });
  },
});
```

### In an Electron App

```typescript
// Main process
import { createCodingLoop, applyFileChanges } from "@/lib/coding-loop";

ipcMain.handle("process-prompt", async (event, { prompt, appPath }) => {
  const loop = createCodingLoop({ chatMode: "build" });

  const result = await loop.process({
    prompt,
    appPath,
    messageHistory: [],
    codebaseFiles: await collectFiles(appPath),
    streamText: yourStreamFunction,
    onChunk: async ({ fullResponse }) => {
      event.sender.send("chat:chunk", { content: fullResponse });
      return fullResponse;
    },
  });

  await loop.applyChanges({
    appPath,
    parsedResponse: result.parsedResponse,
  });

  return result;
});
```

### In a Web Server (Express/Node.js)

```typescript
import express from "express";
import { createCodingLoop } from "@/lib/coding-loop";

const app = express();

app.post("/api/generate", async (req, res) => {
  const { prompt, projectId } = req.body;
  const projectPath = getProjectPath(projectId);

  const loop = createCodingLoop({ chatMode: "build" });

  // Use SSE for streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");

  const result = await loop.process({
    prompt,
    appPath: projectPath,
    messageHistory: await getHistory(projectId),
    codebaseFiles: await getCodebase(projectPath),
    streamText: yourStreamFunction,
    onChunk: async ({ fullResponse }) => {
      res.write(`data: ${JSON.stringify({ content: fullResponse })}\n\n`);
      return fullResponse;
    },
  });

  await loop.applyChanges({
    appPath: projectPath,
    parsedResponse: result.parsedResponse,
  });

  res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
  res.end();
});
```

## API Reference

### `createCodingLoop(config)`

Creates a new coding loop instance.

| Option                    | Type      | Default | Description                          |
| ------------------------- | --------- | ------- | ------------------------------------ |
| `chatMode`                | `string`  | -       | "build", "ask", or "agent"           |
| `enableAutoFix`           | `boolean` | `true`  | Enable auto-fix for detected errors  |
| `maxAutoFixAttempts`      | `number`  | `2`     | Max auto-fix iterations              |
| `maxContinuationAttempts` | `number`  | `2`     | Max attempts to continue truncated   |
| `aiRules`                 | `string`  | -       | Custom rules for the AI              |
| `enableThinking`          | `boolean` | `true`  | Enable `<think>` blocks in responses |

### `loop.process(options)`

Process a user prompt and generate AI response.

Returns: `Promise<ProcessResult>`

### `loop.applyChanges(options)`

Apply parsed file operations to filesystem.

Returns: `Promise<FileOperationResult>`

### `parseResponse(text)`

Parse all dyad tags from an AI response.

Returns: `ParsedResponse`

### `constructSystemPrompt(options)`

Build a system prompt for the AI.

Returns: `string`

## File Structure

```
src/lib/coding-loop/
├── index.ts           # Main exports
├── types.ts           # TypeScript types
├── tag-parser.ts      # Parse XML tags from responses
├── prompts.ts         # System prompt templates
├── file-operations.ts # Filesystem operations
├── coding-loop.ts     # Main orchestration class
└── README.md          # This documentation
```

## Contributing

This library is part of Dyad. When modifying:

1. Ensure backwards compatibility with existing Dyad functionality
2. Add tests for new features
3. Update this README with any new APIs

## License

Part of Dyad - see the main project LICENSE file.
