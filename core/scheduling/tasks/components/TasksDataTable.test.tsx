/**
 * TasksDataTable — compact-mode empty-state snapshot.
 *
 * Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29).
 *
 * The compact code path renders a dashed-border placard when `data` is
 * empty and never iterates the rows — no `useCompleteTask` / `useOrgMembers`
 * hooks are invoked, so the test renders without a Convex provider.
 * Populated-mode rendering relies on per-row provider context
 * (`<TaskQuickComplete>` calls `useCompleteTask`, `<AssigneeCell>` reads
 * `useOrgMembers`) and is exercised by the page-level e2e suite — not in
 * this unit. Keeping the unit focused on the empty branch isolates the
 * core "no tasks" UX from upstream provider plumbing.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TasksDataTable } from "./TasksDataTable";

describe("TasksDataTable (compact)", () => {
	it("renders the empty placard when there are no tasks", () => {
		const { getByText, container } = render(<TasksDataTable data={[]} compact />);
		expect(getByText("All clear")).toBeInTheDocument();
		expect(getByText(/No open tasks right now/i)).toBeInTheDocument();
		expect(container.firstChild).toMatchSnapshot();
	});
});
