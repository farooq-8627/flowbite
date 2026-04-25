# 🤖 AI Integration Guide - Furtiny E-commerce Platform

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture Overview](#architecture-overview)
3. [Core Technologies](#core-technologies)
4. [AI Agent Implementation](#ai-agent-implementation)
5. [Tool System](#tool-system)
6. [Frontend Integration](#frontend-integration)
7. [Backend API Routes](#backend-api-routes)
8. [State Management](#state-management)
9. [Authentication Integration](#authentication-integration)
10. [AI-Powered Admin Dashboard](#ai-powered-admin-dashboard)
11. [Environment Configuration](#environment-configuration)
12. [How to Replicate in Your Project](#how-to-replicate-in-your-project)

---

## 🎯 Overview

This project demonstrates a **native AI integration** into an e-commerce platform WITHOUT relying on third-party AI platforms or complex infrastructure. The AI assistant can:

- **Search Products** - Filter by category, material, color, and price
- **Check Orders** - Authenticated users can track their orders
- **Provide Recommendations** - Suggest similar products
- **Generate Admin Insights** - Analyze sales trends and inventory

**Key Principle**: The AI is tightly integrated into the app's business logic, using custom tools that directly query the database (Sanity CMS) and respect user authentication.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                         │
│  (ChatSheet.tsx - Chat UI Component)                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   @ai-sdk/react Hook                            │
│  useChat() - Manages messages, streaming, and tool calls       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API Route Handler                             │
│  app/api/chat/route.ts - POST endpoint                         │
│  - Checks authentication via Clerk                              │
│  - Creates agent with user context                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI AGENT (ToolLoopAgent)                      │
│  lib/ai/shopping-agent.ts                                       │
│  - Model: Claude Sonnet 4.5 via AI Gateway                     │
│  - Instructions: System prompt with tool usage guidelines       │
│  - Tools: searchProducts, getMyOrders (if authenticated)       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TOOL EXECUTION                                │
│  lib/ai/tools/                                                  │
│  - searchProducts: Queries Sanity for products                 │
│  - getMyOrders: Fetches user's order history                   │
│  ↓                                                               │
│  Sanity CMS (Database)                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Core Technologies

### 1. **Vercel AI SDK** (`ai` package)
- **Purpose**: Provides the framework for building AI agents with tool calling
- **Version**: `6.0.0-beta.137`
- **Key Components**:
  - `ToolLoopAgent` - Agent that can call tools iteratively
  - `tool()` - Function to define custom tools
  - `gateway()` - Multi-provider LLM support
  - `useChat()` - React hook for chat UI
  - `createAgentUIStreamResponse()` - Streaming responses to frontend

### 2. **AI Gateway** (Vercel)
- **Purpose**: Unified API for accessing multiple LLM providers
- **Configuration**: Single `AI_GATEWAY_API_KEY` environment variable
- **Benefits**:
  - Easy provider switching (Claude ↔ GPT ↔ Cohere)
  - Request caching and analytics
  - Rate limiting and error handling
- **Usage**: `gateway("anthropic/claude-sonnet-4.5")`

### 3. **Claude Sonnet 4.5** (Anthropic)
- **Purpose**: The LLM model powering the shopping assistant
- **Why Claude**: Excellent at tool calling and following complex instructions
- **Alternative**: Can swap to GPT-4 or other models via gateway

### 4. **Clerk AgentKit** (`@clerk/agent-toolkit`)
- **Purpose**: Provides authenticated context to AI tools
- **Version**: `^0.2.7`
- **Integration**: Tools can access `userId` to fetch user-specific data

---

## 🛠️ AI Agent Implementation

### File: `lib/ai/shopping-agent.ts`

This is the **heart** of the AI system. Let me break it down:

#### 1. **Agent Configuration**

```typescript
export function createShoppingAgent({ userId }: ShoppingAgentOptions) {
  const isAuthenticated = !!userId;
  
  // Conditional instructions based on auth
  const instructions = isAuthenticated
    ? baseInstructions + ordersInstructions
    : baseInstructions + notAuthenticatedInstructions;
  
  // Conditional tools - orders only if authenticated
  const tools: Record<string, Tool> = {
    searchProducts: searchProductsTool,
  };
  
  if (getMyOrdersTool) {
    tools.getMyOrders = getMyOrdersTool;
  }
  
  return new ToolLoopAgent({
    model: gateway("anthropic/claude-sonnet-4.5"),
    instructions,
    tools,
  });
}
```

**Key Insights**:
- ✅ **Dynamic Tool Availability**: Orders tool only added for authenticated users
- ✅ **Context-Aware Instructions**: AI receives different prompts based on auth state
- ✅ **ToolLoopAgent**: Allows the AI to call multiple tools in sequence

#### 2. **System Prompt (Instructions)**

The `baseInstructions` variable contains:
- **Tool usage guidelines** - How to use searchProducts with parameters
- **Category mapping** - Exact category slugs ("sofas", "chairs", etc.)
- **Search strategies** - When to use filters vs. text search
- **Response formatting** - How to present products with links
- **Stock handling** - Always mention stock status

**Example instruction snippet**:
```
For "leather sofas under £1000":
{
  "query": "",
  "category": "sofas",
  "material": "leather",
  "maxPrice": 1000
}
```

This is **crucial** - the AI learns how to map natural language to structured tool inputs.

#### 3. **Authentication-Aware Instructions**

```typescript
const ordersInstructions = `
## getMyOrders Tool Usage
You have access to the getMyOrders tool to check the user's order history...
`;

const notAuthenticatedInstructions = `
## Orders - Not Available
The user is not signed in. If they ask about orders, politely let them know...
`;
```

This prevents the AI from hallucinating order data for unauthenticated users.

---

## 🧰 Tool System

### Tool 1: **searchProducts**

**File**: `lib/ai/tools/search-products.ts`

```typescript
export const searchProductsTool = tool({
  description: "Search for products in the furniture store...",
  inputSchema: productSearchSchema, // Zod schema
  execute: async ({ query, category, material, color, minPrice, maxPrice }) => {
    // Query Sanity CMS
    const { data: products } = await sanityFetch({
      query: AI_SEARCH_PRODUCTS_QUERY,
      params: { searchQuery, categorySlug, material, color, minPrice, maxPrice },
    });
    
    // Format results for AI
    const formattedProducts = products.map((product) => ({
      id: product._id,
      name: product.name,
      price: product.price,
      priceFormatted: formatPrice(product.price),
      stockStatus: getStockStatus(product.stock),
      productUrl: `/products/${product.slug}`,
      // ... more fields
    }));
    
    return {
      found: true,
      totalResults: products.length,
      products: formattedProducts,
    };
  },
});
```

**What Makes This Work**:
1. **Zod Schema Validation** - Ensures AI provides correct parameter types
2. **Direct Database Query** - Uses GROQ to query Sanity CMS
3. **Structured Response** - Returns JSON the AI can understand and present
4. **Stock Status Calculation** - Business logic handled here, not by AI

### Tool 2: **getMyOrders**

**File**: `lib/ai/tools/get-my-orders.ts`

```typescript
export function createGetMyOrdersTool(userId: string | null) {
  if (!userId) {
    return null; // Tool not available
  }
  
  return tool({
    description: "Get the current user's orders...",
    inputSchema: getMyOrdersSchema,
    execute: async ({ status }) => {
      const { data: orders } = await sanityFetch({
        query: ORDERS_BY_USER_QUERY,
        params: { clerkUserId: userId }, // Uses authenticated user ID
      });
      
      // Filter by status if provided
      let filteredOrders = status 
        ? orders.filter(order => order.status === status)
        : orders;
      
      return {
        found: true,
        orders: formattedOrders,
        isAuthenticated: true,
      };
    },
  });
}
```

**Security & Privacy**:
- ✅ Tool only created if `userId` exists
- ✅ Query scoped to authenticated user's data
- ✅ No way to access other users' orders

---

## 🎨 Frontend Integration

### 1. **ChatSheet Component**

**File**: `components/app/ChatSheet.tsx`

```typescript
export function ChatSheet() {
  const isOpen = useIsChatOpen();
  const { closeChat, clearPendingMessage } = useChatActions();
  const pendingMessage = usePendingMessage();
  const { isSignedIn } = useAuth();
  
  const { messages, sendMessage, status } = useChat();
  const isLoading = status === "streaming" || status === "submitted";
  
  // ... UI rendering
}
```

**Key Features**:
- `useChat()` hook from `@ai-sdk/react` - Handles all communication with `/api/chat`
- **Streaming support** - Messages appear word-by-word
- **Tool call visualization** - Shows when AI is searching products or fetching orders
- **Auto-scroll** - Follows conversation as messages arrive

### 2. **Tool Call UI**

**File**: `components/app/chat/ToolCallUI.tsx`

Displays tool execution status:
- **Loading state**: "Searching products..." with spinner
- **Complete state**: "Search complete" with checkmark
- **Results**: Product/order cards rendered inline

```typescript
export function ToolCallUI({ toolPart, closeChat }: ToolCallUIProps) {
  const isComplete = toolPart.state === "result";
  const productResult = toolPart.result as SearchProductsResult;
  
  return (
    <div>
      {/* Tool status indicator */}
      <div>{isComplete ? "✓ Complete" : "⏳ Searching..."}</div>
      
      {/* Product cards */}
      {productResult?.products?.map(product => (
        <ProductCardWidget product={product} />
      ))}
    </div>
  );
}
```

### 3. **Product & Order Widgets**

**Files**: `components/app/chat/ProductCardWidget.tsx`, `OrderCardWidget.tsx`

These are **interactive cards** that appear in the chat:
- Clickable links to product/order pages
- Show images, prices, stock status
- Responsive design (close chat on mobile when clicked)

---

## 🔌 Backend API Routes

### Chat Endpoint

**File**: `app/api/chat/route.ts`

```typescript
export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  
  // Get authenticated user ID (null if not signed in)
  const { userId } = await auth();
  
  // Create agent with user context
  const agent = createShoppingAgent({ userId });
  
  // Stream response back to frontend
  return createAgentUIStreamResponse({
    agent,
    messages,
  });
}
```

**Flow**:
1. Frontend sends conversation history
2. Clerk checks authentication
3. Agent created with appropriate tools
4. AI processes message, calls tools if needed
5. Response streamed back to frontend

---

## 📊 AI-Powered Admin Dashboard

**File**: `app/api/admin/insights/route.ts`

This endpoint generates **business insights** using AI:

```typescript
export async function GET() {
  // 1. Fetch analytics data from Sanity
  const [recentOrders, statusDistribution, productSales, ...] = await Promise.all([
    client.fetch(ORDERS_LAST_7_DAYS_QUERY),
    client.fetch(ORDER_STATUS_DISTRIBUTION_QUERY),
    // ... more queries
  ]);
  
  // 2. Prepare data summary
  const dataSummary = {
    salesTrends: { currentWeekRevenue, previousWeekRevenue, topProducts },
    inventory: { needsRestock, slowMoving, lowStockCount },
    operations: { unfulfilledOrders, urgentOrders },
  };
  
  // 3. Generate AI insights
  const { text } = await generateText({
    model: gateway("anthropic/claude-sonnet-4"),
    system: `You are an expert e-commerce analytics assistant...`,
    prompt: `Analyze this store data: ${JSON.stringify(dataSummary)}`,
  });
  
  // 4. Parse and return structured insights
  const insights = JSON.parse(text);
  return Response.json({ success: true, insights });
}
```

**AI Output Structure**:
```json
{
  "salesTrends": {
    "summary": "Revenue increased 15% this week...",
    "highlights": ["50 orders processed", "Top seller: Oak Table"],
    "trend": "up"
  },
  "inventory": {
    "summary": "3 products need restocking...",
    "alerts": ["Leather Sofa has only 2 left"],
    "recommendations": ["Reorder popular items before weekend"]
  },
  "actionItems": {
    "urgent": ["Ship 5 pending orders"],
    "recommended": ["Review low stock items"],
    "opportunities": ["Feature best sellers on homepage"]
  }
}
```

---

## 🔐 Authentication Integration

### Clerk + AI Agent

```typescript
// In API route
const { userId } = await auth();

// Pass to agent factory
const agent = createShoppingAgent({ userId });

// Tool uses userId
export function createGetMyOrdersTool(userId: string | null) {
  if (!userId) return null; // Tool not available
  
  return tool({
    execute: async () => {
      // Query scoped to this userId
      const orders = await sanityFetch({
        query: ORDERS_BY_USER_QUERY,
        params: { clerkUserId: userId },
      });
    },
  });
}
```

**Security Benefits**:
- ✅ No way to access other users' data
- ✅ Tool conditionally available
- ✅ AI instructions change based on auth state
- ✅ Frontend shows auth-aware welcome screen

---

## 💾 State Management

### Chat Store

**File**: `lib/store/chat-store.ts`

```typescript
export const createChatStore = (initState: ChatState = defaultInitState) => {
  return createStore<ChatStore>()((set) => ({
    isOpen: false,
    pendingMessage: null,
    
    openChat: () => set({ isOpen: true }),
    openChatWithMessage: (message: string) => 
      set({ isOpen: true, pendingMessage: message }),
    closeChat: () => set({ isOpen: false }),
  }));
};
```

**Usage**:
- "Ask AI for similar products" button pre-fills chat with message
- Chat state managed globally with Zustand
- No persistence (chat always starts closed)

---

## ⚙️ Environment Configuration

### Required Variables

```bash
# Vercel AI Gateway (for LLM access)
AI_GATEWAY_API_KEY=Your_value_goes_here

# Clerk (for authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=Your_value
CLERK_SECRET_KEY=Your_value

# Sanity (CMS database)
NEXT_PUBLIC_SANITY_PROJECT_ID=Your_value
SANITY_API_WRITE_TOKEN=Your_value
```

**Why AI Gateway?**
- Single API key for multiple LLM providers
- Built-in caching and rate limiting
- Easy to switch models: `gateway("anthropic/claude-sonnet-4.5")`

---

## 🚀 How to Replicate in Your Project

### Step 1: Install Dependencies

```bash
npm install ai @ai-sdk/react @clerk/nextjs zod
```

### Step 2: Set Up API Route

Create `app/api/chat/route.ts`:

```typescript
import { createAgentUIStreamResponse } from "ai";
import { auth } from "@clerk/nextjs/server";
import { createYourAgent } from "@/lib/ai/your-agent";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const { userId } = await auth();
  
  const agent = createYourAgent({ userId });
  
  return createAgentUIStreamResponse({ agent, messages });
}
```

### Step 3: Create Your Agent

Create `lib/ai/your-agent.ts`:

```typescript
import { gateway, ToolLoopAgent, tool } from "ai";
import { z } from "zod";

// Define your tools
const searchTool = tool({
  description: "Search your database",
  inputSchema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => {
    // Query your database
    const results = await yourDatabase.search(query);
    return { results };
  },
});

export function createYourAgent({ userId }) {
  return new ToolLoopAgent({
    model: gateway("anthropic/claude-sonnet-4.5"),
    instructions: "You are a helpful assistant...",
    tools: {
      search: searchTool,
    },
  });
}
```

### Step 4: Add Frontend Component

Create your chat UI using `useChat()` hook:

```typescript
"use client";
import { useChat } from "@ai-sdk/react";

export function ChatComponent() {
  const { messages, sendMessage, status } = useChat();
  
  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
      <button onClick={() => sendMessage({ text: "Hello!" })}>
        Send
      </button>
    </div>
  );
}
```

### Step 5: Configure Environment

Add to `.env.local`:

```bash
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

Get your key from: [vercel.com/ai](https://vercel.com/ai)

---

## 🎯 Key Takeaways for CRM Integration

### For Your Flowbite CRM Project:

1. **Define Your Tools First**
   - What actions should AI perform? (Create lead, update deal, send email)
   - Map each action to a database operation
   - Use Zod schemas for type safety

2. **Use Tool-Based Architecture**
   - Don't try to make AI "smart" - make tools smart
   - AI just routes user intent to the right tool
   - Tools handle all business logic

3. **Authentication is Key**
   - Pass `userId` to agent factory
   - Scope all queries to authenticated user
   - Conditionally add tools based on permissions

4. **System Prompts Matter**
   - Teach AI your data structure
   - Provide examples of tool usage
   - Define response formatting

5. **Frontend Integration**
   - `useChat()` hook handles complexity
   - Tool results can be rendered as custom components
   - Streaming provides great UX

### Example CRM Tools You Could Build:

```typescript
// Tool: Create Lead
const createLeadTool = tool({
  description: "Create a new lead in the CRM",
  inputSchema: z.object({
    name: z.string(),
    email: z.string().email(),
    company: z.string().optional(),
    source: z.enum(["website", "referral", "cold-call"]),
  }),
  execute: async ({ name, email, company, source }) => {
    const lead = await db.leads.create({ name, email, company, source });
    return { success: true, leadId: lead.id };
  },
});

// Tool: Search Contacts
const searchContactsTool = tool({
  description: "Search contacts by name, email, or company",
  inputSchema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => {
    const contacts = await db.contacts.search(query);
    return { contacts };
  },
});

// Tool: Update Deal Stage
const updateDealTool = tool({
  description: "Update a deal's stage in the pipeline",
  inputSchema: z.object({
    dealId: z.string(),
    stage: z.enum(["prospecting", "qualified", "proposal", "won", "lost"]),
  }),
  execute: async ({ dealId, stage }) => {
    await db.deals.update(dealId, { stage });
    return { success: true };
  },
});
```

---

## 📚 Additional Resources

- **Vercel AI SDK Docs**: https://sdk.vercel.ai/docs
- **Clerk AgentKit**: https://clerk.com/docs/references/javascript/clerk-agent-toolkit
- **Anthropic Claude**: https://www.anthropic.com/claude
- **Sanity CMS**: https://www.sanity.io/docs

---

## 🤝 Summary

This project demonstrates **native AI integration** by:

1. ✅ Using Vercel AI SDK for tool-based agents
2. ✅ Creating custom tools that query your database
3. ✅ Integrating authentication for user-scoped AI
4. ✅ Providing real-time streaming chat UI
5. ✅ NO third-party AI platforms or complex infrastructure

**The secret**: AI doesn't "do" the work - it just routes user intent to the right tool. Tools do all the heavy lifting by querying your database and executing business logic.

You can replicate this exact pattern in any project (CRM, admin dashboard, customer support, etc.) by:
- Defining tools for your use cases
- Creating an agent with those tools
- Adding a chat UI with `useChat()` hook
- Connecting to your database in tool implementations

---

**Generated for**: Furtiny E-commerce Platform  
**Date**: 2026-04-20  
**Purpose**: Reference guide for replicating AI integration in other projects
