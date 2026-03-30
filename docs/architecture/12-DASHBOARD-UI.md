# 12 — Dashboard UI

> The dashboard shell: sidebar, navbar, responsive layout. Features plug into it via registration — they don't modify the shell directly.

---

## Layout Architecture

```
┌──────────────────────────────────────────────────────┐
│  Navbar (sticky top)                                  │
│  ┌───────┬──────────────────────┬───────────────────┐│
│  │ Menu  │  Breadcrumbs         │ Search │ Bell │ 👤 ││
│  └───────┴──────────────────────┴───────────────────┘│
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Main Content Area                        │
│          │                                           │
│ ┌──────┐ │  ┌─────────────────────────────────────┐  │
│ │ Home │ │  │                                     │  │
│ │ Conn.│ │  │  Page content rendered by features  │  │
│ │ Sett.│ │  │                                     │  │
│ │ Admin│ │  │                                     │  │
│ └──────┘ │  └─────────────────────────────────────┘  │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

---

## Dashboard Layout (Server Component)

```tsx
// app/[locale]/dashboard/layout.tsx
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Navbar } from "@/components/dashboard/Navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <OrgGuard>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Navbar />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </OrgGuard>
    </AuthGuard>
  );
}
```

### AuthGuard

```tsx
"use client";
import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) redirect("/signin");

  return <>{children}</>;
}
```

### OrgGuard

```tsx
"use client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export function OrgGuard({ children }: { children: React.ReactNode }) {
  const { org, isLoading } = useCurrentUser();

  if (isLoading) return <FullPageLoader />;
  if (!org) return <OrgSetup />;  // Onboard user to create/join an org

  return <>{children}</>;
}
```

---

## Sidebar

Reads from the feature registry + checks permissions and feature flags.

```tsx
// components/dashboard/Sidebar.tsx
"use client";
import { useUIStore } from "@/lib/stores/uiStore";
import { getRegisteredFeatures } from "@/features/_registry";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useFeatureFlag } from "@/lib/hooks/useFeatureFlag";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const pathname = usePathname();
  const { can } = usePermissions();

  const features = getRegisteredFeatures();

  // Base nav items (always present)
  const baseItems = [
    { id: "home", label: "Dashboard", href: "/dashboard", icon: Home },
  ];

  // Filter features by permissions and flags
  const featureItems = features.filter(f => {
    if (f.permissions && !f.permissions.some(p => can(p))) return false;
    // Feature flag check would go here if needed
    return true;
  });

  const settingsItems = [
    { id: "settings", label: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <aside className={cn(
      "flex flex-col border-r bg-background transition-all duration-200",
      sidebarOpen ? "w-64" : "w-16",
    )}>
      {/* Logo + collapse toggle */}
      {/* Base items */}
      {/* Feature items (dynamically registered) */}
      {/* Settings items (bottom) */}
    </aside>
  );
}
```

### Feature Registration Example

```ts
// features/connections/register.ts
import { registerFeature } from "@/features/_registry";
import { Link2 } from "lucide-react";

registerFeature({
  id: "connections",
  label: "Connections",
  icon: Link2,
  href: "/dashboard/connections",
  permissions: ["connections.viewAll"],
  order: 10,
});
```

When this file is imported (via the feature's barrel export), the sidebar gets the "Connections" item.

---

## Navbar

```tsx
// components/dashboard/Navbar.tsx
export function Navbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-background px-4">
      <SidebarToggle />
      <BreadcrumbNav />
      <div className="ml-auto flex items-center gap-3">
        <CommandPaletteButton />    {/* Cmd+K */}
        <NotificationBell />         {/* Unread count + dropdown */}
        <UserMenu />                 {/* Avatar, profile, org switcher, logout */}
      </div>
    </header>
  );
}
```

---

## Reusable Data Components

### DataTable

A generic table component that handles sorting, pagination, filtering, and column configuration:

```tsx
// components/data/DataTable.tsx
interface DataTableProps<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  pagination?: {
    hasMore: boolean;
    loadMore: () => void;
  };
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, isLoading, ... }: DataTableProps<T>) {
  if (isLoading) return <LoadingState />;
  if (!data?.length) return <EmptyState />;
  // Render table with columns
}
```

Usage by any feature:

```tsx
<DataTable
  data={connections}
  columns={connectionColumns}
  onRowClick={(row) => router.push(`/dashboard/connections/${row._id}`)}
/>
```

### KanbanBoard

```tsx
// Reusable Kanban with configurable columns
interface KanbanProps<T> {
  items: T[];
  columns: { id: string; label: string }[];
  getColumnId: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onDragEnd: (itemId: string, newColumnId: string) => void;
}
```

---

## Modal Pattern

```tsx
// Controlled modals via Zustand
// lib/stores/uiStore.ts
interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  modalData: any;
  openModal: (id: string, data?: any) => void;
  closeModal: () => void;
  // ...
}
```

Usage:

```tsx
const { openModal } = useUIStore();

<Button onClick={() => openModal("create-connection")}>New Connection</Button>

// In the feature:
function CreateConnectionModal() {
  const { activeModal, modalData, closeModal } = useUIStore();
  if (activeModal !== "create-connection") return null;

  return (
    <Dialog open onOpenChange={closeModal}>
      {/* Form content */}
    </Dialog>
  );
}
```

---

## Toast Notifications (Client-side)

Using `sonner` for ephemeral UI feedback (success/error messages):

```tsx
import { toast } from "sonner";

// In a mutation handler on the frontend:
try {
  await createConnection({ orgId, title: "New Project" });
  toast.success("Connection created");
} catch (error) {
  toast.error("Failed to create connection");
}
```

This is separate from the notification system. Toasts are ephemeral client feedback. Notifications are persistent server records.
