/**
 * Internal context for sharing the active org's entity labels with the
 * dashboard tree. Owned by `OrgProvider` (in `useCurrentOrg.tsx`); read
 * by `useEntityLabels` (which falls back to its own `useQuery` when this
 * context isn't available, e.g. on signed-out routes or in tests).
 *
 * Kept in a leaf module to break the circular import that would otherwise
 * exist between `useCurrentOrg.tsx` and `useEntityLabels.ts`.
 */
"use client";

import { createContext } from "react";
import type { EntityLabels } from "./entity-labels-types";

export const OrgEntityLabelsContext = createContext<EntityLabels | null>(null);
