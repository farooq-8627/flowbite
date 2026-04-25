/**
 * Layout type definitions for the dashboard shell.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * These types drive the SidebarProvider and content area styling.
 * All values are persisted to cookies for SSR-safe rendering.
 */

// --- Sidebar ---

/** How the sidebar is visually styled within the layout */
export const SIDEBAR_VARIANTS = ["sidebar", "inset", "floating"] as const;
export type SidebarVariant = (typeof SIDEBAR_VARIANTS)[number];

/** How the sidebar collapses on smaller viewports or when toggled */
export const SIDEBAR_COLLAPSIBLE_MODES = ["icon", "offcanvas"] as const;
export type SidebarCollapsible = (typeof SIDEBAR_COLLAPSIBLE_MODES)[number];

// --- Content Area ---

/** Controls max-width of the main content area */
export const CONTENT_LAYOUTS = ["centered", "full-width"] as const;
export type ContentLayout = (typeof CONTENT_LAYOUTS)[number];

// --- Navbar ---

/** Controls navbar scroll behavior */
export const NAVBAR_STYLES = ["sticky", "scroll"] as const;
export type NavbarStyle = (typeof NAVBAR_STYLES)[number];
