# core/command-palette — MODULE.md
## Command Palette & Global Keyboard Shortcuts
> **Phase**: 2 · **Status**: Build after entity modules are wired — needs real data to search
> **Consumers**: Triggered from `TopNav.tsx` (search icon), keyboard shortcut `Cmd+K` everywhere

---

## Purpose

The command palette is the **universal entry point** for power users. It combines:
1. **Global search** — find any entity by name, email, personCode, dealCode, etc.
2. **Quick actions** — navigate, open AI, toggle theme, go to settings
3. **Saved view shortcuts** — jump to any pinned saved view
4. **Context-aware suggestions** — current page suggests relevant actions

It uses the `cmdk` library (already part of shadcn/ui). No additional search infrastructure needed — queries go directly to Convex.

---

## Folder Structure

```
core/command-palette/
├── MODULE.md                           # this file
├── index.ts                            # barrel export
│
├── components/
│   ├── CommandPalette.tsx              # Root — Dialog + Command container
│   ├── CommandSearch.tsx               # Input + results rendering
│   ├── CommandEntityItem.tsx           # Search result row for leads/contacts/deals
│   ├── CommandActionItem.tsx           # Navigation or action row
│   └── CommandEmpty.tsx               # No results state
│
├── config/
│   └── shortcuts.ts                    # All keyboard shortcut definitions
│
└── hooks/
    ├── useCommandPalette.ts            # Open/close state + global trigger
    ├── useGlobalSearch.ts             # Debounced search query to Convex
    └── usePageActions.ts              # Context-aware actions for current page
```

---

## Architecture

### CommandPalette — Root Component

```typescript
// core/command-palette/components/CommandPalette.tsx
import { Command, CommandDialog, CommandInput, CommandList,
         CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "cmdk";

export function CommandPalette() {
  const { isOpen, close }  = useCommandPalette();
  const [query, setQuery]  = useState("");
  const pathname           = usePathname();
  const { orgSlug }        = useParams();
  const router             = useAppRouter();

  // Debounced search — only fires after 200ms of no typing
  const results = useGlobalSearch(query);

  // Context-aware actions (changes based on current page)
  const pageActions = usePageActions(pathname, orgSlug as string);

  // Close on escape (cmdk handles this, but also reset query)
  function handleOpenChange(open: boolean) {
    if (!open) { close(); setQuery(""); }
  }

  function handleSelect(value: string) {
    close();
    setQuery("");
    // value is a serialised action descriptor: "navigate:/leads" or "entity:lead:id_abc"
    executeAction(value, router, orgSlug as string);
  }

  return (
    <CommandDialog open={isOpen} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search people, deals, or type a command..."
        value={query}
        onValueChange={setQuery}
      />

      <CommandList>
        {/* No query — show page-specific quick actions */}
        {!query && (
          <>
            <CommandGroup heading="Quick Actions">
              {pageActions.map(action => (
                <CommandActionItem key={action.id} action={action} onSelect={handleSelect} />
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Navigation">
              {STATIC_NAV_ACTIONS(orgSlug as string).map(action => (
                <CommandActionItem key={action.id} action={action} onSelect={handleSelect} />
              ))}
            </CommandGroup>
          </>
        )}

        {/* Active search — show entity results */}
        {query && (
          <>
            {/* personCode / entity code direct resolution */}
            {results?.byCode && (
              <CommandGroup heading="Record Match">
                <CommandEntityItem
                  entity={results.byCode}
                  onSelect={handleSelect}
                  orgSlug={orgSlug as string}
                />
              </CommandGroup>
            )}

            {results?.leads && results.leads.length > 0 && (
              <CommandGroup heading="Leads">
                {results.leads.map(lead => (
                  <CommandEntityItem key={lead._id} entity={lead} type="lead"
                    onSelect={handleSelect} orgSlug={orgSlug as string} />
                ))}
              </CommandGroup>
            )}

            {results?.contacts && results.contacts.length > 0 && (
              <CommandGroup heading="Contacts">
                {results.contacts.map(c => (
                  <CommandEntityItem key={c._id} entity={c} type="contact"
                    onSelect={handleSelect} orgSlug={orgSlug as string} />
                ))}
              </CommandGroup>
            )}

            {results?.deals && results.deals.length > 0 && (
              <CommandGroup heading="Deals">
                {results.deals.map(d => (
                  <CommandEntityItem key={d._id} entity={d} type="deal"
                    onSelect={handleSelect} orgSlug={orgSlug as string} />
                ))}
              </CommandGroup>
            )}

            {results?.companies && results.companies.length > 0 && (
              <CommandGroup heading="Companies">
                {results.companies.map(c => (
                  <CommandEntityItem key={c._id} entity={c} type="company"
                    onSelect={handleSelect} orgSlug={orgSlug as string} />
                ))}
              </CommandGroup>
            )}

            {/* No results */}
            {results && !results.byCode &&
              !results.leads?.length && !results.contacts?.length &&
              !results.deals?.length && !results.companies?.length && (
              <CommandEmpty>No results for "{query}"</CommandEmpty>
            )}
          </>
        )}
      </CommandList>

      {/* Hint bar at bottom */}
      <div className="border-t px-3 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span><kbd className="bg-muted px-1 rounded text-[9px]">↵</kbd> Open</span>
        <span><kbd className="bg-muted px-1 rounded text-[9px]">Esc</kbd> Close</span>
        <span className="ms-auto">Try: <em>P-001</em> to find a person by code</span>
      </div>
    </CommandDialog>
  );
}
```

---

## Global Search Query — Convex-Powered

```typescript
// core/command-palette/hooks/useGlobalSearch.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export function useGlobalSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, 200);

  // Skip query if too short — avoids unnecessary Convex calls
  return useQuery(
    api.search.global,
    debouncedQuery.length >= 2 ? { query: debouncedQuery } : "skip"
  );
}
```

```typescript
// convex/search/queries.ts::global
export const global = orgQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const normalised = query.trim().toUpperCase();

    // 1. PRIORITY: Check if query looks like a record code — resolve instantly
    const org = await ctx.db.get(ctx.org._id);
    const prefixes = org.settings?.codePrefixes ?? DEFAULT_PREFIXES;
    const isCode = Object.values(prefixes).some(p => normalised.startsWith(p + "-"));

    if (isCode) {
      // Use searchByCode — resolves across leads AND contacts
      const codeResult = await resolveByCode(ctx, normalised);
      if (codeResult) return { byCode: codeResult, leads: [], contacts: [], deals: [], companies: [] };
    }

    // 2. Text search across all entities (Convex search indexes)
    const [leads, contacts, deals, companies] = await Promise.all([
      ctx.db.query("leads")
        .withSearchIndex("search_displayName", q =>
          q.search("displayName", query).eq("orgId", ctx.org._id))
        .take(5),
      ctx.db.query("contacts")
        .withSearchIndex("search_displayName", q =>
          q.search("displayName", query).eq("orgId", ctx.org._id))
        .take(5),
      ctx.db.query("deals")
        .withSearchIndex("search_title", q =>
          q.search("title", query).eq("orgId", ctx.org._id))
        .take(5),
      ctx.db.query("companies")
        .withSearchIndex("search_name", q =>
          q.search("name", query).eq("orgId", ctx.org._id))
        .take(5),
    ]);

    return { byCode: null, leads, contacts, deals, companies };
  },
});
// Search indexes required in schema.ts on each entity table:
// .searchIndex("search_displayName", { searchField: "displayName", filterFields: ["orgId"] })
```

---

## CommandEntityItem — Consistent Result Row

```typescript
// core/command-palette/components/CommandEntityItem.tsx
interface CommandEntityItemProps {
  entity: Lead | Contact | Deal | Company;
  type: "lead" | "contact" | "deal" | "company";
  onSelect: (value: string) => void;
  orgSlug: string;
}

export function CommandEntityItem({ entity, type, onSelect, orgSlug }: CommandEntityItemProps) {
  const Icon = { lead: Target, contact: User, deal: DollarSign, company: Building2 }[type];
  const code = "personCode" in entity ? entity.personCode
             : "dealCode"   in entity ? entity.dealCode
             : "companyCode" in entity ? entity.companyCode : "";
  const name = "displayName" in entity ? entity.displayName : entity.name;
  const href = `/dashboard/${orgSlug}/${type}s/${entity._id}`;

  return (
    <CommandItem
      value={`entity:${type}:${entity._id}`}
      onSelect={() => onSelect(`navigate:${href}`)}
      className="flex items-center gap-3 py-2"
    >
      <Icon className="size-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{name}</span>
        {"email" in entity && entity.email && (
          <span className="text-xs text-muted-foreground ms-2 truncate">{entity.email as string}</span>
        )}
      </div>
      {/* Record code badge — always visible */}
      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
        {code}
      </span>
    </CommandItem>
  );
}
```

---

## Keyboard Shortcuts

```typescript
// core/command-palette/config/shortcuts.ts
import { useHotkeys } from "react-hotkeys-hook";

export const SHORTCUTS = {
  OPEN_PALETTE:      "mod+k",         // Cmd+K (mac) / Ctrl+K (win)
  TOGGLE_AI:         "mod+\\",        // Cmd+\ / Ctrl+\
  TOGGLE_SIDEBAR:    "mod+b",         // Cmd+B
  NOTIFICATIONS:     "mod+shift+n",   // Cmd+Shift+N
  GO_LEADS:          "mod+shift+l",
  GO_CONTACTS:       "mod+shift+c",
  GO_DEALS:          "mod+shift+e",
  GO_SETTINGS:       "mod+,",
  TOGGLE_THEME:      "mod+shift+t",
  FOCUS_SEARCH:      "/",             // "/" when not in input — focus palette
} as const;

// Registered in a single hook — mounted once at layout level
export function useGlobalShortcuts(orgSlug: string) {
  const router          = useAppRouter();
  const { open, close, isOpen } = useCommandPalette();
  const { toggle: toggleAI }    = useChatStore();

  useHotkeys(SHORTCUTS.OPEN_PALETTE,   (e) => { e.preventDefault(); isOpen ? close() : open(); }, { enableOnFormTags: false });
  useHotkeys(SHORTCUTS.TOGGLE_AI,      (e) => { e.preventDefault(); toggleAI(); });
  useHotkeys(SHORTCUTS.TOGGLE_SIDEBAR, (e) => { e.preventDefault(); /* sidebar toggle */ });
  useHotkeys(SHORTCUTS.GO_LEADS,       () => router.push(`/dashboard/${orgSlug}/leads`));
  useHotkeys(SHORTCUTS.GO_CONTACTS,    () => router.push(`/dashboard/${orgSlug}/contacts`));
  useHotkeys(SHORTCUTS.GO_DEALS,       () => router.push(`/dashboard/${orgSlug}/deals`));
  useHotkeys(SHORTCUTS.GO_SETTINGS,    () => router.push(`/dashboard/${orgSlug}/settings/general`));
}

// Mounted once in DashboardLayout:
// <DashboardLayout>
//   <GlobalShortcutsProvider orgSlug={orgSlug} />   ← just calls useGlobalShortcuts
//   ...
```

---

## Context-Aware Page Actions

```typescript
// core/command-palette/hooks/usePageActions.ts
// Returns relevant quick actions based on current URL

export function usePageActions(pathname: string, orgSlug: string): CommandAction[] {
  const canCreateLead    = useOrgPermission("leads.create");
  const canCreateDeal    = useOrgPermission("deals.create");
  const canCreateContact = useOrgPermission("contacts.create");

  const PAGE_ACTIONS: Record<string, CommandAction[]> = {
    [`/dashboard/${orgSlug}/leads`]: [
      canCreateLead && { id: "add-lead", label: "Add Lead", icon: Plus, action: "modal:add-lead" },
      { id: "import-leads", label: "Import from CSV", icon: Upload, action: "navigate:/csv-import" },
      { id: "open-ai",  label: "Ask AI about Leads", icon: Sparkles, action: "toggle:ai" },
    ].filter(Boolean) as CommandAction[],

    [`/dashboard/${orgSlug}/deals`]: [
      canCreateDeal && { id: "add-deal", label: "Add Deal", icon: Plus, action: "modal:add-deal" },
      { id: "pipeline-view", label: "Pipeline Health", icon: BarChart2, action: "toggle:ai-pipeline" },
    ].filter(Boolean) as CommandAction[],
  };

  // Fuzzy match current pathname to get actions
  const exactMatch = PAGE_ACTIONS[pathname];
  if (exactMatch) return exactMatch;

  // Default actions for any page
  return [
    { id: "toggle-ai", label: "Open AI Assistant", icon: Sparkles, action: "toggle:ai",
      shortcut: "⌘\\" },
    canCreateLead    && { id: "add-lead",    label: "Add Lead",    icon: Target, action: "modal:add-lead" },
    canCreateContact && { id: "add-contact", label: "Add Contact", icon: User,   action: "modal:add-contact" },
    canCreateDeal    && { id: "add-deal",    label: "Add Deal",    icon: DollarSign, action: "modal:add-deal" },
  ].filter(Boolean) as CommandAction[];
}
```

---

## Static Navigation Actions

```typescript
// core/command-palette/components/CommandPalette.tsx (inline)
function STATIC_NAV_ACTIONS(orgSlug: string): CommandAction[] {
  return [
    { id: "nav-dashboard",  label: "Dashboard",       icon: LayoutDashboard, action: `navigate:/dashboard/${orgSlug}` },
    { id: "nav-leads",      label: "Leads",           icon: Target,          action: `navigate:/dashboard/${orgSlug}/leads` },
    { id: "nav-contacts",   label: "Contacts",        icon: Users,           action: `navigate:/dashboard/${orgSlug}/contacts` },
    { id: "nav-deals",      label: "Deals",           icon: DollarSign,      action: `navigate:/dashboard/${orgSlug}/deals` },
    { id: "nav-settings",   label: "Settings",        icon: Settings,        action: `navigate:/dashboard/${orgSlug}/settings/general` },
    { id: "nav-billing",    label: "Billing",         icon: CreditCard,      action: `navigate:/dashboard/${orgSlug}/settings/billing` },
    { id: "toggle-theme",   label: "Toggle Theme",    icon: Moon,            action: "toggle:theme", shortcut: "⌘⇧T" },
    { id: "toggle-ai",      label: "AI Assistant",    icon: Sparkles,        action: "toggle:ai",    shortcut: "⌘\\" },
  ];
}
```

---

## Action Executor

```typescript
// core/command-palette/components/CommandPalette.tsx
function executeAction(value: string, router: AppRouter, orgSlug: string) {
  const [type, payload] = value.split(":").slice(0, 2);

  switch (type) {
    case "navigate":
      router.push(payload.startsWith("/dashboard") ? payload : `/dashboard/${orgSlug}${payload}`);
      break;
    case "toggle":
      if (payload === "ai")    useChatStore.getState().toggle();
      if (payload === "theme") toggleTheme();
      break;
    case "modal":
      // Signals are dispatched via a simple event bus — modal listens
      window.dispatchEvent(new CustomEvent(`orbitly:open-modal`, { detail: { modal: payload } }));
      break;
    case "entity":
      // Already handled by CommandEntityItem — this case shouldn't reach here
      break;
  }
}
```

---

## Package Dependencies

```bash
# cmdk is already included in shadcn/ui — no additional install needed
# For keyboard shortcuts:
pnpm add react-hotkeys-hook
```

---

## Convex Search Index Requirements

Add to `convex/schema.ts` for each searchable entity:

```typescript
leads: defineTable({ ... })
  .searchIndex("search_displayName", { searchField: "displayName", filterFields: ["orgId"] }),

contacts: defineTable({ ... })
  .searchIndex("search_displayName", { searchField: "displayName", filterFields: ["orgId"] }),

deals: defineTable({ ... })
  .searchIndex("search_title", { searchField: "title", filterFields: ["orgId"] }),

companies: defineTable({ ... })
  .searchIndex("search_name", { searchField: "name", filterFields: ["orgId"] }),
```

---

## Never-Do List for This Module

```typescript
// ❌ Never search without an orgId filter — all queries scoped to org
// ❌ Never fire search on every keystroke — always debounce (200ms)
// ❌ Never search with query < 2 characters — skip the query
// ❌ Never show all results for a type — always .take(5) per entity type
// ❌ Never hardcode nav routes with locale — always use useAppRouter()
// ❌ Never register shortcuts in multiple places — single GlobalShortcutsProvider in layout
// ❌ Never hide personCode/dealCode in search results — always visible in the result row
```

---

## Rules
- [ ] R-CMD-01: Entity group labels in command palette MUST use dynamic labels from `orgs.entityLabels` — never hardcode "Leads", "Contacts"
- [ ] R-CMD-02: Search results show entity type using dynamic labels (e.g., "Inquiry" not "Lead")
- [ ] R-CMD-03: RTL-safe classes only (ms-*, me-*, ps-*, pe-*)
- [ ] R-CMD-04: rounded-[var(--radius)] only — never rounded-md/lg
- [ ] R-CMD-05: Command palette respects RBAC — hide commands user lacks permission for
