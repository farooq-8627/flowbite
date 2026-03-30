<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

---

# ⛔ ABSOLUTE RULE — NO TRAINING DATA

> **This rule overrides everything. No exceptions. Ever.**

## 🚫 NEVER write code, patterns, configs, or suggestions from AI training data memory.

### Mandatory Workflow Before Any Code:

1. **Scan web first** — Use Firecrawl `firecrawl-search` to find production codebases
2. **Search GitHub** — Use `github-mcp-server-search_code` for real implementations
3. **Use MCPs** — Convex MCP, Sentry MCP, Trigger.dev MCP for live data
4. **Read official docs** — Fetch via Firecrawl, never recall from memory
5. **Read project files** — Use `.github/agents/base/` as ground truth

### End-of-Chat Attestation (COMPULSORY):

Every response MUST end with:
```
📚 Sources: [list all URLs used]
✅ Training Data Used: NONE
```
