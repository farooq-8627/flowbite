# Orbitly AI Integration Architecture
## Complete Frontend-to-Backend AI System with File Attachments & Web Search

> **Status**: Production-Ready Blueprint  
> **Last Updated**: 2026-05-03  
> **Purpose**: Complete architectural guide for integrating Vercel AI SDK with Convex backend

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack & Dependencies](#tech-stack--dependencies)
3. [Data Flow](#data-flow)
4. [Backend Architecture (Convex)](#backend-architecture-convex)
5. [API Layer (Next.js)](#api-layer-nextjs)
6. [Frontend Architecture (React)](#frontend-architecture-react)
7. [File Attachments System](#file-attachments-system)
8. [Web Search Integration](#web-search-integration)
9. [Tool Calling System](#tool-calling-system)
10. [Implementation Checklist](#implementation-checklist)

---

## Architecture Overview

### The Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: Frontend (React + AI SDK)                         │
│ - ChatSheet component (resizable right panel)              │
│ - useChat() hook with streaming                            │
│ - File drag-and-drop                                       │
│ - Tool call visualization                                  │
│ - Message history UI                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: API Route (Next.js - Thin Proxy)                  │
│ - app/api/ai/chat/route.ts                                 │
│ - Validates Convex auth token                              │
│ - Calls Convex internalAction                              │
│ - Streams response back                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ Convex Action
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Backend (Convex - AI Logic)                       │
│ - convex/ai/processChat.ts (internalAction)                │
│ - Full database access                                     │
│ - RBAC enforcement                                         │
│ - Tool registry (RBAC-filtered)                            │
│ - Model routing (task-based)                               │
│ - Conversation persistence                                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Convex internalAction for AI logic** | Full DB access, RBAC enforcement, no API route complexity |
| **Thin API route proxy** | Only validates auth + streams, zero business logic |
| **RBAC-filtered tools** | AI sees only tools user has permission to use |
| **Task-based model routing** | Simple queries → Haiku, Complex → Sonnet |
| **File attachments via experimental_attachments** | Native AI SDK support, handles images/PDFs |
| **CSV parsed client-side** | Never send raw CSV to Claude, parse → structured data |
| **Web search via Firecrawl** | Trigger.dev job for scraping, not direct Claude call |

---

## Tech Stack & Dependencies

### Already Installed (Verified)

```json
{
  "ai": "^4.0.0",                    // Vercel AI SDK
  "convex": "^1.x",                  // Backend
  "next": "16.x",                    // Framework
  "react": "19.x",                   // UI
  "@ai-sdk/anthropic": "^1.x",       // Claude models
  "zod": "^3.x"                      // Validation
}
```

### Need to Install

```bash
pnpm add react-textarea-autosize     # Auto-resizing input
pnpm add papaparse                   # CSV parsing
pnpm add @types/papaparse -D         # TypeScript types
```

### Optional (Phase 2)

```bash
pnpm add react-dropzone              # Enhanced file drop UI
pnpm add react-markdown              # Rich message rendering
```

---

## Data Flow

### Complete Request Flow (User Message → AI Response)

```
1. USER TYPES MESSAGE + DROPS FILE
   ↓
2. Frontend: useAIChat() hook
   - Validates file type
   - CSV → parse client-side → add as context
   - Images/PDFs → convert to data URL
   - Calls sendMessage({ text, experimental_attachments })
   ↓
3. Frontend: POST /api/ai/chat
   - Body: { messages, conversationId, entityContext, attachments }
   - Headers: { Authorization: Convex token }
   ↓
4. API Route: app/api/ai/chat/route.ts
   - Validates Convex auth (rejects if invalid)
   - Extracts userId + orgId from session
   - Calls convex.action(internal.ai.processChat, { ... })
   - Streams response back via AI SDK
   ↓
5. Convex Action: convex/ai/processChat.ts
   - Loads conversation history from DB
   - Builds system prompt (3-layer context)
   - Filters tools by user's role permissions
   - Routes to appropriate model (Haiku vs Sonnet)
   - Calls Claude via AI SDK
   - Tool calls → executes Convex mutations
   - Saves messages to aiMessages table
   - Returns streaming response
   ↓
6. Frontend: useChat() receives stream
   - Renders messages in real-time
   - Shows tool call loading states
   - Updates conversation history
   - Scrolls to bottom
```

### Conversation Persistence Flow

```
First message:
  → Create aiConversations record
  → Generate conversationId
  → Store in aiMessages table

Subsequent messages:
  → Load existing conversation
  → Append new messages
  → Update lastMessageAt timestamp

Context window overflow:
  → AI summarizes older messages
  → Store summary in aiConversations.contextSummary
  → Keep recent messages + summary
```

---

## Backend Architecture (Convex)

### File Structure

```
convex/
├── ai/
│   ├── processChat.ts              # Main AI action (internalAction)
│   ├── systemPrompt.ts             # 3-layer prompt builder
│   ├── toolRegistry.ts             # RBAC-filtered tool definitions
│   ├── modelRouter.ts              # Task-based model selection
│   ├── conversations.ts            # Conversation CRUD
│   └── tools/
│       ├── search.ts               # searchEntities, searchByCode
│       ├── create.ts               # createEntity (leads/contacts/deals)
│       ├── update.ts               # updateEntity, moveDealStage
│       ├── notes.ts                # addNote, searchNotes
│       ├── reminders.ts            # setReminder, getOverdueReminders
│       ├── detail.ts               # getEntityDetail, getPersonGraph
│       ├── analytics.ts            # getDashboardStats, getPipelineHealth
│       ├── drafts.ts               # draftMessage, draftFollowup
│       ├── bulk.ts                 # bulkUpdate (requires confirmation)
│       ├── workspace.ts            # setupWorkspace, setupPipeline
│       └── webSearch.ts            # searchWeb (via Firecrawl)
│
└── schema.ts                       # Add aiConversations + aiMessages tables
```

### Schema Additions

```typescript
// convex/schema.ts

aiConversations: defineTable({
  orgId: v.id("orgs"),
  userId: v.id("users"),
  title: v.optional(v.string()),           // Auto-generated from first message
  contextSummary: v.optional(v.string()),  // Compressed older messages
  messageCount: v.number(),
  lastMessageAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_user_and_org", ["orgId", "userId"])
.index("by_org_and_recent", ["orgId", "lastMessageAt"]),

aiMessages: defineTable({
  orgId: v.id("orgs"),
  conversationId: v.id("aiConversations"),
  role: v.string(),                        // "user" | "assistant" | "system"
  content: v.string(),
  toolCalls: v.optional(v.array(v.object({
    toolName: v.string(),
    input: v.any(),
    result: v.optional(v.any()),
  }))),
  attachments: v.optional(v.array(v.object({
    name: v.string(),
    type: v.string(),
    url: v.string(),
  }))),
  tokenUsage: v.optional(v.object({
    input: v.number(),
    output: v.number(),
  })),
  createdAt: v.number(),
})
.index("by_conversation", ["conversationId", "createdAt"])
.index("by_org", ["orgId", "createdAt"]),
```

---


### Core Backend Implementation

#### 1. Main AI Action (convex/ai/processChat.ts)

```typescript
// convex/ai/processChat.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { buildSystemPrompt } from "./systemPrompt";
import { getToolsForRole } from "./toolRegistry";
import { routeModel } from "./modelRouter";

export const processChat = internalAction({
  args: {
    userId: v.id("users"),
    orgId: v.id("orgs"),
    messages: v.array(v.any()),
    conversationId: v.optional(v.id("aiConversations")),
    currentRoute: v.optional(v.string()),
    entityContext: v.optional(v.object({
      entityType: v.string(),
      entityId: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Billing check (BEFORE Claude call)
    const org = await ctx.runQuery(internal.orgs.get, { orgId: args.orgId });
    if (org.billing?.status === "suspended") {
      throw new Error("Account suspended. Update payment.");
    }
    
    const usage = await ctx.runQuery(internal.ai.getUsageThisMonth, { 
      orgId: args.orgId 
    });
    const limit = org.plan === "free" ? 0 : org.plan === "starter" ? 100 : 500;
    
    if (usage >= limit) {
      throw new Error(`${limit} AI messages used. Upgrade to continue.`);
    }

    // 2. Get or create conversation
    let conversationId = args.conversationId;
    if (!conversationId) {
      conversationId = await ctx.runMutation(
        internal.ai.conversations.create,
        { userId: args.userId, orgId: args.orgId }
      );
    }

    // 3. Build system prompt (3-layer context)
    const systemPrompt = await buildSystemPrompt(ctx, {
      userId: args.userId,
      orgId: args.orgId,
      currentRoute: args.currentRoute,
      entityContext: args.entityContext,
    });

    // 4. Get RBAC-filtered tools
    const tools = await getToolsForRole(ctx, args.userId, args.orgId);

    // 5. Route to appropriate model
    const model = routeModel(args.messages);

    // 6. Call Claude with streaming
    const result = await streamText({
      model: anthropic(model),
      system: systemPrompt,
      messages: args.messages,
      tools,
      maxSteps: 5, // Allow multi-step tool calls
      onFinish: async ({ text, toolCalls, usage }) => {
        // Save assistant message to DB
        await ctx.runMutation(internal.ai.conversations.addMessage, {
          conversationId,
          role: "assistant",
          content: text,
          toolCalls,
          tokenUsage: usage,
        });
        
        // Update usage counter
        await ctx.runMutation(internal.ai.incrementUsage, {
          orgId: args.orgId,
          tokens: usage.totalTokens,
        });
      },
    });

    return result.toDataStreamResponse();
  },
});
```

#### 2. System Prompt Builder (convex/ai/systemPrompt.ts)

```typescript
// convex/ai/systemPrompt.ts
import { QueryCtx } from "./_generated/server";

export async function buildSystemPrompt(
  ctx: QueryCtx,
  args: {
    userId: string;
    orgId: string;
    currentRoute?: string;
    entityContext?: { entityType: string; entityId: string };
  }
): Promise<string> {
  // Layer 1: Global platform context
  const platform = await ctx.runQuery(internal.platform.getContext);

  // Layer 2: Org context
  const org = await ctx.runQuery(internal.orgs.get, { orgId: args.orgId });
  const member = await ctx.runQuery(internal.orgMembers.get, {
    userId: args.userId,
    orgId: args.orgId,
  });
  const role = await ctx.runQuery(internal.orgRoles.get, { 
    roleId: member.roleId 
  });

  // Layer 3: Entity context (if on entity detail page)
  let entityContext = "";
  if (args.entityContext) {
    const entity = await ctx.runQuery(internal.entities.get, {
      entityType: args.entityContext.entityType,
      entityId: args.entityContext.entityId,
    });
    
    entityContext = `
CURRENT RECORD IN VIEW:
- Type: ${args.entityContext.entityType}
- Name: ${entity.displayName || entity.title}
- Person Code: ${entity.personCode}
- AI Context: ${JSON.stringify(entity.aiContext, null, 2)}

You are viewing this specific record. Prioritize answers about it.
`;
  }

  return `
${platform.content}

ORG: ${org.name}
INDUSTRY: ${org.settings?.industry || "General"}
YOUR ROLE: ${role.name}
PERMISSIONS: ${role.permissions.join(", ")}
CURRENT PAGE: ${args.currentRoute || "Dashboard"}

${entityContext}

TODAY: ${new Date().toISOString().split("T")[0]}

INSTRUCTIONS:
- Be concise and professional
- Use the user's language (detect from their message)
- Always check permissions before suggesting actions
- Show data previews before executing destructive actions
- Reference personCode (P-001) when discussing people
- Use dealCode (D-001) when discussing deals
`;
}
```

#### 3. Tool Registry (convex/ai/toolRegistry.ts)

```typescript
// convex/ai/toolRegistry.ts
import { tool } from "ai";
import { z } from "zod";
import { internal } from "./_generated/api";

const TOOL_PERMISSIONS: Record<string, string | null> = {
  searchEntities: "leads.view",
  searchByCode: null, // No permission needed
  createEntity: "leads.create",
  updateEntity: "leads.update",
  addNote: "notes.create",
  setReminder: "reminders.create",
  getEntityDetail: "leads.view",
  getDashboardStats: "reports.view",
  draftMessage: null, // Draft only, no execution
  bulkUpdate: "data.bulkActions",
  setupWorkspace: "ai.workspaceSetup",
};

export async function getToolsForRole(
  ctx: QueryCtx,
  userId: string,
  orgId: string
) {
  const permissions = await ctx.runQuery(
    internal.permissions.getUserPermissions,
    { userId, orgId }
  );

  const allTools = {
    searchByCode: tool({
      description: "Search for any entity by its code (P-001, D-001, FU-001, etc.)",
      parameters: z.object({
        code: z.string().describe("The entity code to search for"),
      }),
      execute: async ({ code }) => {
        return await ctx.runQuery(internal.search.searchByCode, {
          orgId,
          code,
        });
      },
    }),

    createEntity: tool({
      description: "Create a new lead, contact, or deal",
      parameters: z.object({
        entityType: z.enum(["lead", "contact", "deal"]),
        displayName: z.string(),
        email: z.string().email().optional(),
        personCode: z.string().optional(),
      }),
      execute: async (params) => {
        // Show preview first
        return {
          type: "confirmation_required",
          preview: params,
          message: "Should I create this record?",
        };
      },
    }),

    // ... more tools
  };

  // Filter tools by permissions
  return Object.entries(allTools)
    .filter(([name]) => {
      const requiredPerm = TOOL_PERMISSIONS[name];
      return !requiredPerm || permissions.includes(requiredPerm);
    })
    .reduce((acc, [name, tool]) => ({ ...acc, [name]: tool }), {});
}
```

#### 4. Model Router (convex/ai/modelRouter.ts)

```typescript
// convex/ai/modelRouter.ts

export function routeModel(messages: any[]): string {
  const lastMessage = messages[messages.length - 1];
  const content = lastMessage?.content || "";

  // Simple queries → fast model
  if (
    content.length < 100 ||
    content.toLowerCase().includes("search") ||
    content.toLowerCase().includes("find") ||
    content.toLowerCase().includes("show me")
  ) {
    return "claude-3-5-haiku-20241022"; // Fast, cheap
  }

  // Complex queries → powerful model
  if (
    content.toLowerCase().includes("analyze") ||
    content.toLowerCase().includes("summarize") ||
    content.toLowerCase().includes("forecast") ||
    content.toLowerCase().includes("setup")
  ) {
    return "claude-3-5-sonnet-20241022"; // Powerful
  }

  // Default: balanced model
  return "claude-3-5-sonnet-20241022";
}
```

---


## API Layer (Next.js)

### Thin Proxy Pattern

```typescript
// app/api/ai/chat/route.ts
import { auth } from "@/lib/auth";
import { fetchAction } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export const maxDuration = 60; // 60 seconds for streaming

export async function POST(req: Request) {
  // 1. Validate auth (server-side only)
  const session = await auth();
  if (!session?.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Parse request
  const { messages, conversationId, currentRoute, entityContext } = 
    await req.json();

  // 3. Call Convex action (streams automatically)
  const stream = await fetchAction(api.ai.processChat, {
    userId: session.userId,
    orgId: session.orgId,
    messages,
    conversationId,
    currentRoute,
    entityContext,
  });

  // 4. Return stream
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

**Key Points:**
- ✅ Zero business logic in API route
- ✅ Auth validation only (userId/orgId from session, never from body)
- ✅ Streaming handled automatically by Convex
- ✅ 60-second timeout for long AI responses

---

## Frontend Architecture (React)

### File Structure

```
core/ai/
├── components/
│   ├── ChatSheet.tsx                # Main resizable panel
│   ├── MessageList.tsx              # Scrollable message container
│   ├── MessageBubble.tsx            # Single message (user/assistant)
│   ├── ToolCallCard.tsx             # Tool execution visualization
│   ├── ConfirmationCard.tsx         # Destructive action confirmation
│   ├── ChatInput.tsx                # Textarea with file drop
│   ├── FilePreview.tsx              # Attached file chips
│   ├── ConversationSwitcher.tsx     # Dropdown for past conversations
│   └── ProactiveSuggestions.tsx     # Context-aware quick actions
│
├── hooks/
│   ├── useAIChat.ts                 # Wrapper around useChat()
│   ├── useFileAttachments.ts        # File handling logic
│   └── useEntityContext.ts          # Detect current page context
│
└── stores/
    └── chatStore.ts                 # Zustand (isOpen, pendingMessage)
```

### Main ChatSheet Component

```typescript
// core/ai/components/ChatSheet.tsx
"use client";

import { useAIChat } from "../hooks/useAIChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { ProactiveSuggestions } from "./ProactiveSuggestions";
import { useChatStore } from "../stores/chatStore";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function ChatSheet() {
  const { isOpen, close } = useChatStore();
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    entityContext,
  } = useAIChat();

  return (
    <Sheet open={isOpen} onOpenChange={close}>
      <SheetContent 
        side="right" 
        className="w-[600px] sm:w-[540px] p-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">AI Assistant</h2>
          <ConversationSwitcher />
        </div>

        {/* Proactive suggestions (when entity context exists) */}
        {entityContext && messages.length === 0 && (
          <ProactiveSuggestions entityContext={entityContext} />
        )}

        {/* Messages */}
        <MessageList messages={messages} isLoading={isLoading} />

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isLoading}
        />
      </SheetContent>
    </Sheet>
  );
}
```

### useAIChat Hook (Core Integration)

```typescript
// core/ai/hooks/useAIChat.ts
"use client";

import { useChat } from "ai/react";
import { usePathname, useParams } from "next/navigation";
import { useMemo } from "react";
import { useFileAttachments } from "./useFileAttachments";

export function useAIChat() {
  const pathname = usePathname();
  const params = useParams();

  // Detect entity context from URL
  const entityContext = useMemo(() => {
    if (pathname.includes("/leads/") && params.id) {
      return { entityType: "lead", entityId: params.id as string };
    }
    if (pathname.includes("/contacts/") && params.id) {
      return { entityType: "contact", entityId: params.id as string };
    }
    if (pathname.includes("/deals/") && params.id) {
      return { entityType: "deal", entityId: params.id as string };
    }
    return null;
  }, [pathname, params]);

  // File attachments handling
  const { attachments, addFiles, removeFile, clearFiles } = 
    useFileAttachments();

  // AI SDK useChat hook
  const chat = useChat({
    api: "/api/ai/chat",
    body: {
      currentRoute: pathname,
      entityContext,
    },
    experimental_attachments: attachments,
    onFinish: () => {
      clearFiles(); // Clear after message sent
    },
  });

  return {
    ...chat,
    entityContext,
    attachments,
    addFiles,
    removeFile,
  };
}
```

### File Attachments Hook

```typescript
// core/ai/hooks/useFileAttachments.ts
"use client";

import { useState } from "react";
import Papa from "papaparse";

export function useFileAttachments() {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [csvData, setCsvData] = useState<any[] | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Separate CSVs from other files
    const csvFiles = fileArray.filter(f => f.name.endsWith(".csv"));
    const otherFiles = fileArray.filter(f => !f.name.endsWith(".csv"));

    // Parse CSVs client-side
    if (csvFiles.length > 0) {
      const csv = csvFiles[0];
      Papa.parse(csv, {
        header: true,
        complete: (results) => {
          setCsvData(results.data);
          // Add CSV summary as text context (not raw file)
          const summary = `CSV file: ${csv.name}, ${results.data.length} rows, columns: ${Object.keys(results.data[0] || {}).join(", ")}`;
          // This gets added to the message context
        },
      });
    }

    // Other files (images, PDFs) go directly to AI
    setAttachments((prev) => [...prev, ...otherFiles]);
  };

  const removeFile = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setAttachments([]);
    setCsvData(null);
  };

  return {
    attachments,
    csvData,
    addFiles,
    removeFile,
    clearFiles,
  };
}
```

### ChatInput with File Drop

```typescript
// core/ai/components/ChatInput.tsx
"use client";

import { useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { Paperclip, Send } from "lucide-react";
import { FilePreview } from "./FilePreview";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled?: boolean;
  attachments?: File[];
  onFilesAdded?: (files: FileList) => void;
  onFileRemoved?: (index: number) => void;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  attachments = [],
  onFilesAdded,
  onFileRemoved,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && onFilesAdded) {
      onFilesAdded(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0 && onFilesAdded) {
      onFilesAdded(e.clipboardData.files);
    }
  };

  return (
    <form onSubmit={onSubmit} className="border-t p-4">
      {/* File previews */}
      {attachments.length > 0 && (
        <FilePreview files={attachments} onRemove={onFileRemoved} />
      )}

      {/* Input area */}
      <div
        className="flex items-end gap-2"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && onFilesAdded) {
              onFilesAdded(e.target.files);
            }
          }}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <TextareaAutosize
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="Ask AI anything... (Cmd+K to toggle)"
          className="flex-1 resize-none border-0 bg-transparent focus:outline-none"
          minRows={1}
          maxRows={5}
          disabled={disabled}
        />

        <Button type="submit" size="icon" disabled={disabled || !value.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Drop files, paste images, or attach CSVs
      </p>
    </form>
  );
}
```

---


## Tool Calling System

### Tool Call Visualization

```typescript
// core/ai/components/ToolCallCard.tsx
"use client";

import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface ToolCallCardProps {
  toolName: string;
  input: any;
  result?: any;
  status: "pending" | "success" | "error";
}

export function ToolCallCard({ 
  toolName, 
  input, 
  result, 
  status 
}: ToolCallCardProps) {
  return (
    <Card className="p-4 my-2">
      <div className="flex items-start gap-3">
        {/* Status icon */}
        {status === "pending" && (
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        )}
        {status === "success" && (
          <CheckCircle className="h-5 w-5 text-green-500" />
        )}
        {status === "error" && (
          <XCircle className="h-5 w-5 text-red-500" />
        )}

        <div className="flex-1">
          <p className="font-medium text-sm">
            {formatToolName(toolName)}
          </p>
          
          {/* Input preview */}
          <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>

          {/* Result */}
          {result && (
            <div className="mt-2 p-2 bg-muted rounded text-xs">
              {typeof result === "string" 
                ? result 
                : JSON.stringify(result, null, 2)}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
```

### Confirmation Card (Destructive Actions)

```typescript
// core/ai/components/ConfirmationCard.tsx
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmationCardProps {
  action: string;
  preview: any;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({
  action,
  preview,
  onConfirm,
  onCancel,
}: ConfirmationCardProps) {
  return (
    <Card className="p-4 my-2 border-orange-500">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        
        <div className="flex-1">
          <p className="font-medium text-sm">Confirm Action</p>
          <p className="text-sm text-muted-foreground mt-1">
            {action}
          </p>

          {/* Data preview */}
          <div className="mt-2 p-3 bg-muted rounded text-xs">
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={onConfirm}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

---

## Web Search Integration

### Architecture

```
User: "Search web for SaaS founders in Dubai"
  ↓
AI: Calls webSearch tool
  ↓
Convex: Triggers Trigger.dev job
  ↓
Trigger.dev: Runs Firecrawl search
  ↓
Returns: Structured results
  ↓
AI: Presents results as table
  ↓
User: Selects which to import
  ↓
AI: Calls createEntity for each
```

### Web Search Tool

```typescript
// convex/ai/tools/webSearch.ts
import { tool } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";

export const webSearchTool = tool({
  description: "Search the web for business information, leads, or research",
  parameters: z.object({
    query: z.string().describe("What to search for"),
    source: z.enum(["google", "reddit", "maps", "linkedin"]).optional(),
    location: z.string().optional().describe("Geographic location filter"),
  }),
  execute: async ({ query, source, location }, { ctx }) => {
    // Trigger background job
    const jobId = await ctx.scheduler.runAfter(
      0,
      internal.jobs.webSearch,
      { query, source, location, orgId: ctx.orgId }
    );

    // Return immediately (job runs in background)
    return {
      type: "job_started",
      jobId,
      message: `Searching ${source || "web"} for: ${query}...`,
      status: "You'll see results in a moment.",
    };
  },
});
```

### Trigger.dev Job

```typescript
// trigger/jobs/webSearch.ts
import { task } from "@trigger.dev/sdk/v3";
import { FirecrawlApp } from "@mendable/firecrawl-js";

export const webSearchJob = task({
  id: "web-search",
  run: async ({ query, source, location, orgId }) => {
    const firecrawl = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY!,
    });

    let results = [];

    if (source === "reddit") {
      // Search Reddit
      const searchResults = await firecrawl.search(
        `site:reddit.com ${query}`,
        { limit: 10 }
      );
      results = searchResults.data;
    } else if (source === "maps") {
      // Google Maps search (via API)
      // Implementation depends on Maps API
    } else {
      // General web search
      const searchResults = await firecrawl.search(query, { 
        limit: 10 
      });
      results = searchResults.data;
    }

    // Store results in Convex
    await convex.mutation(internal.search.storeResults, {
      orgId,
      query,
      results,
    });

    return { success: true, count: results.length };
  },
});
```

---

## File Attachments System

### Supported File Types

| Type | Handling | Use Case |
|------|----------|----------|
| **CSV** | Parse client-side → structured data | Import leads/contacts |
| **Images** | Send to Claude as image content | Screenshots, mockups, documents |
| **PDFs** | Send to Claude as document | Contracts, proposals, invoices |
| **Text** | Send as plain text | Notes, requirements |

### CSV Import Flow

```
1. User drops CSV file
   ↓
2. Frontend: Parse with PapaParse
   - Extract headers
   - Preview first 5 rows
   ↓
3. AI sees: "CSV with 47 rows: name, email, company, phone"
   ↓
4. AI asks: "Should I import these as leads?"
   ↓
5. User confirms
   ↓
6. AI calls: importLeads tool with structured data
   ↓
7. Convex: Creates leads in batch
   ↓
8. AI responds: "Imported 47 leads successfully"
```

### Image/PDF Flow

```
1. User drops image/PDF
   ↓
2. Frontend: Convert to data URL
   ↓
3. Send to AI SDK with experimental_attachments
   ↓
4. Claude receives image/document
   ↓
5. Claude can:
   - Describe what's in the image
   - Extract text from document
   - Answer questions about it
   - Create records based on content
```

---

## Implementation Checklist

### Phase 1: Backend Setup (Convex)

- [ ] Add `aiConversations` + `aiMessages` tables to schema
- [ ] Create `convex/ai/processChat.ts` (internalAction)
- [ ] Create `convex/ai/systemPrompt.ts` (3-layer builder)
- [ ] Create `convex/ai/toolRegistry.ts` (RBAC filtering)
- [ ] Create `convex/ai/modelRouter.ts` (task-based routing)
- [ ] Create `convex/ai/conversations.ts` (CRUD mutations)
- [ ] Create tool files in `convex/ai/tools/`:
  - [ ] `search.ts` (searchEntities, searchByCode)
  - [ ] `create.ts` (createEntity with confirmation)
  - [ ] `update.ts` (updateEntity, moveDealStage)
  - [ ] `notes.ts` (addNote, searchNotes)
  - [ ] `reminders.ts` (setReminder with NL date parsing)
  - [ ] `detail.ts` (getEntityDetail, getPersonGraph)
  - [ ] `analytics.ts` (getDashboardStats, getPipelineHealth)
  - [ ] `drafts.ts` (draftMessage, draftFollowup)
  - [ ] `webSearch.ts` (searchWeb via Firecrawl)

### Phase 2: API Layer (Next.js)

- [ ] Create `app/api/ai/chat/route.ts` (thin proxy)
- [ ] Validate Convex auth token
- [ ] Stream response from Convex action
- [ ] Set proper headers (Content-Type, Cache-Control)
- [ ] Set maxDuration = 60

### Phase 3: Frontend Core (React)

- [ ] Install dependencies: `react-textarea-autosize`, `papaparse`
- [ ] Create `core/ai/stores/chatStore.ts` (Zustand)
- [ ] Create `core/ai/hooks/useAIChat.ts` (wrapper around useChat)
- [ ] Create `core/ai/hooks/useFileAttachments.ts` (file handling)
- [ ] Create `core/ai/hooks/useEntityContext.ts` (URL detection)

### Phase 4: Frontend Components

- [ ] Create `core/ai/components/ChatSheet.tsx` (main panel)
- [ ] Create `core/ai/components/MessageList.tsx` (scrollable)
- [ ] Create `core/ai/components/MessageBubble.tsx` (single message)
- [ ] Create `core/ai/components/ChatInput.tsx` (with file drop)
- [ ] Create `core/ai/components/FilePreview.tsx` (attached files)
- [ ] Create `core/ai/components/ToolCallCard.tsx` (tool visualization)
- [ ] Create `core/ai/components/ConfirmationCard.tsx` (destructive actions)
- [ ] Create `core/ai/components/ConversationSwitcher.tsx` (history dropdown)
- [ ] Create `core/ai/components/ProactiveSuggestions.tsx` (context-aware)

### Phase 5: Integration

- [ ] Add ChatSheet to `app/[locale]/dashboard/layout.tsx`
- [ ] Wire Cmd+K keyboard shortcut to toggle
- [ ] Test file drag-and-drop
- [ ] Test CSV parsing
- [ ] Test image attachments
- [ ] Test tool calling
- [ ] Test RBAC filtering
- [ ] Test conversation persistence

### Phase 6: Web Search (Optional)

- [ ] Set up Firecrawl API key
- [ ] Create Trigger.dev job for web search
- [ ] Test Reddit search
- [ ] Test Google Maps search
- [ ] Test general web search

---

## Testing Strategy

### Unit Tests (Convex)

```typescript
// convex/ai/processChat.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";

test("AI respects RBAC - viewer cannot create leads", async () => {
  const t = convexTest(schema);
  
  // Create viewer user
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email: "viewer@test.com" });
  });
  
  // Try to create lead via AI
  const result = await t.action(api.ai.processChat, {
    userId,
    orgId: testOrgId,
    messages: [{ role: "user", content: "Create a lead for John" }],
  });
  
  // Should not have createEntity tool available
  expect(result).not.toContain("createEntity");
});
```

### E2E Tests (Playwright)

```typescript
// tests/ai-chat.spec.ts
import { test, expect } from "@playwright/test";

test("AI chat panel opens with Cmd+K", async ({ page }) => {
  await page.goto("/dashboard/test-org");
  
  // Press Cmd+K
  await page.keyboard.press("Meta+K");
  
  // Chat panel should be visible
  await expect(page.locator('[data-testid="chat-sheet"]')).toBeVisible();
});

test("File drop works", async ({ page }) => {
  await page.goto("/dashboard/test-org");
  await page.keyboard.press("Meta+K");
  
  // Drop a file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles("test-data/sample.csv");
  
  // File preview should appear
  await expect(page.locator('[data-testid="file-preview"]')).toBeVisible();
});
```

---

## Performance Optimization

### 1. Lazy Load Chat Panel

```typescript
// app/[locale]/dashboard/layout.tsx
import dynamic from "next/dynamic";

const ChatSheet = dynamic(
  () => import("@/core/ai/components/ChatSheet").then(m => m.ChatSheet),
  { ssr: false }
);
```

### 2. Debounce Input

```typescript
// core/ai/hooks/useAIChat.ts
import { useDebouncedCallback } from "use-debounce";

const debouncedSend = useDebouncedCallback(
  (message) => sendMessage(message),
  300
);
```

### 3. Virtual Scrolling for Long Conversations

```typescript
// core/ai/components/MessageList.tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 100,
});
```

---

## Security Checklist

- [ ] ✅ Auth validation in API route (never trust client)
- [ ] ✅ userId/orgId from session, never from request body
- [ ] ✅ RBAC filtering at tool registry level
- [ ] ✅ Confirmation required for destructive actions
- [ ] ✅ Billing check before Claude call
- [ ] ✅ Rate limiting on API route (optional)
- [ ] ✅ File size limits (max 10MB per file)
- [ ] ✅ File type validation (whitelist only)
- [ ] ✅ No PII in system prompts (use IDs, resolve in tools)
- [ ] ✅ Sanitize user input before storing

---

## Troubleshooting

### Issue: AI not responding

**Check:**
1. Convex deployment status
2. API route logs (`vercel logs`)
3. Anthropic API key validity
4. Billing status (suspended?)
5. Network tab for failed requests

### Issue: Tools not working

**Check:**
1. Tool permissions in `toolRegistry.ts`
2. User's role permissions
3. Tool execution logs in Convex dashboard
4. Tool parameter validation (Zod schema)

### Issue: File attachments not working

**Check:**
1. File size (< 10MB?)
2. File type (CSV/image/PDF only?)
3. Browser console for errors
4. `experimental_attachments` enabled in useChat

---

## Next Steps

1. **Start with backend** - Schema + processChat action
2. **Then API route** - Thin proxy
3. **Then frontend** - ChatSheet + useAIChat
4. **Test incrementally** - Each layer before moving to next
5. **Add tools gradually** - Start with search, then create, then others

**Estimated Time:**
- Backend: 2-3 days
- API + Frontend: 2-3 days
- Tools: 1 day per tool (start with 3-5 core tools)
- **Total: 1-2 weeks for MVP**

---

## References

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Convex Actions](https://docs.convex.dev/functions/actions)
- [AI SDK Attachments](https://github.com/vercel-labs/ai-sdk-preview-attachments)
- [Convex AI Chat Template](https://www.convex.dev/templates/nextjs-ai-chat-template-convex)
- [Vercel Chatbot Template](https://github.com/vercel/chatbot)

---

**END OF DOCUMENT**
