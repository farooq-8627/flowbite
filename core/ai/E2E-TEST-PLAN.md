# AI End-to-End Smoke Test Plan

> This is a **manual** test plan — designed to be run from the chat panel
> after the latest fixes ship (`resume.ts` zod-strip, `friendlyToolError`
> mapper, `runTool` real-message echo, `commit_create_lead` notes-attach).
>
> Run it on the dev deployment with the Gemini 2.0 Flash BYOK key
> selected. Each row records the expected behaviour. If a row fails, copy
> the failure description, the model output, and the timeline screenshot
> into a new `Future-Enhancements.md` card under `§C: audit-flagged` and
> ping the team.

## Prep

- [ ] Add a fresh Gemini key via **Settings → AI → API Keys** (BYOK).
      Prefer "Just me" scope — keeps blast radius small while testing.
- [ ] Pick **gemini-2.0-flash** in the chat model picker (the 🔑 badge
      should appear).
- [ ] Open a fresh conversation so the message history is empty.

## A. Always-on layer (read-only)

| # | Prompt | Expected result | Notes |
|---|---|---|---|
| A1 | "What can you do?" | Markdown reply listing the always-on capabilities. No tool calls. | |
| A2 | "Search for Farooq" | `search_crm` runs, returns N results, EntityList card under it. | If 0 results, the model should offer to create a new lead. |
| A3 | "Open P-001" | `get_entity_detail` resolves to the matching personCode. | Shows EntityResultCard. |
| A4 | "What permissions do I have?" | `list_my_permissions` runs, lists keys. | Should NOT propose layer expansion. |
| A5 | "What lead fields are configured?" | `list_entity_fields` runs with entityType=lead, lists fields. | |
| A6 | "Show today's dashboard" | `get_dashboard_summary` runs, replies with prose summary. | |

## B. CRUD — the one that broke (regression guard)

| # | Prompt | Expected result | Notes |
|---|---|---|---|
| B1 | "Create a lead Farooq, +91 7286 979 408, umarfarooq@example.com, source web, note: SaaS company, 1-10 size" | `create_lead` proposes, approval card shows. Click **Approve**. | |
| B2 | (after B1) | `commit_create_lead` runs, the timeline `Create lead` row turns green ✅, lead card appears with personCode P-XXX, AND the note "SaaS company, 1-10 size" is attached. | This is the bug from the screenshot. |
| B3 | (run B1 again with same email) | `create_lead` proposes, then commit returns the **DUPLICATE** friendly error: "That record already exists. I found it under P-XXX. Would you like to update it instead?" | Was previously "An unexpected error occurred." |
| B4 | "Create a contact Sarah Khan" without an email | Model calls `ask_user_input` to collect email — does NOT propose with a fake email. | |
| B5 | "Create company Acme Corp, website acme.com" | `create_company` proposes → approve → company saved. | |
| B6 | "Create a $5k deal for P-XXX titled Q3 expansion" | `create_deal` proposes (resolves personCode via search) → approve → deal saved. | |

## C. Update + Convert flows

| # | Prompt | Expected result |
|---|---|---|
| C1 | "Update P-XXX phone to +91 9876 543 210" | `update_entity` proposes → approve → updated. |
| C2 | "Convert P-XXX to a contact" | `convert_lead` proposes → approve → personCode preserved. |
| C3 | "Move D-001 to Negotiation" | `move_deal_stage` proposes → approve → stage updated. |
| C4 | "Close D-001 as won, $5,000" | `close_deal` proposes → approve → deal marked won. |

## D. Layer expansion (always-on → on-demand)

| # | Prompt | Expected result |
|---|---|---|
| D1 | "Add a custom field to leads called Lead Score" | `expand_tools` activates the **fields** layer, then `create_field` proposes. |
| D2 | "Tag P-XXX as VIP" | `expand_tools` activates **tags**, then `attach_tag` runs. |
| D3 | "Pin a saved view called Hot Leads filtered by status=qualified" | `expand_tools` activates **views**, then `create_saved_view` proposes. |

## E. Bulk + dangerous

| # | Prompt | Expected result |
|---|---|---|
| E1 | "Tag the 10 latest leads with 'cold-2026'" | `expand_tools` activates **bulk**, then `bulk_tag` proposes. The DangerPreviewCard appears with the row count. |
| E2 | (E1 with >50 rows) | Should refuse without an explicit "yes, proceed with N rows" confirmation. |
| E3 | "Delete saved view 'Hot Leads'" | `delete_saved_view` proposes, approval card shows. |

## F. Subagent routing

| # | Prompt | Expected result |
|---|---|---|
| F1 | "Walk me through CSV import" | The csvImport subagent picks up. System prompt mentions the 4-step workflow. |
| F2 | (Upload a CSV via the composer) | `import_csv` runs the quarantined parser, preview card with row counts shows. |
| F3 | (E2: approve the preview) | `commit_import_csv` runs, leads inserted, summary returned. |
| F4 | "Find missing data on P-XXX" | enrichment subagent picks up, runs the waterfall, EnrichmentPreviewCard shows. |

## G. Error UX (replaces "An unexpected error occurred")

| # | Provoke | Expected result |
|---|---|---|
| G1 | Try to `create_lead` while logged in as a Viewer (no `leads.create`). | "You don't have permission for this. Ask a workspace admin to grant the relevant role." |
| G2 | Spam `create_reminder` 200 times. | "You've hit a rate limit. Wait a minute and try again." |
| G3 | "Create a lead" with a 200-char name that exceeds the schema. | TOOL_INPUT_VALIDATION friendly error with the field path + working example. |
| G4 | (Future) Force an ArgumentValidationError. | ARG_MISMATCH friendly message with workaround instructions. |

## Pass criteria

- ALL of B (regression), G (error UX), and F1-F3 (CSV) pass without red blocks in the timeline.
- Plus 80%+ of A through E pass on the first try.

## What to do when a row fails

1. Open the assistant turn's "Working" dropdown to inspect the timeline.
2. Click the failed row to expand the raw error block.
3. Copy: **prompt + model + first 200 chars of error**.
4. Add a `Future-Enhancements.md §C` card with the above and a one-line
   guess at the cause.
