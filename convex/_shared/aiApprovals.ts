/**
 * convex/_shared/aiApprovals.ts
 *
 * Single source of truth for the AI tool approval-gate model. Imported by:
 *   - `convex/ai/toolRegistry.ts` — `resolveNeedsApproval` consumes this.
 *   - `convex/users/mutations.ts` — validator + updater.
 *   - `core/platform/settings/components/groups/ai/AIApprovalsSection.tsx` — UI rows.
 *   - `convex/ai/approvalGate.test.ts` — contract tests.
 *
 * Why a separate module?
 *
 *   The category list, the defaults map, and the hard-locked set must agree
 *   across backend gate, frontend UI, validators, and tests. Putting them in
 *   one file makes drift impossible — adding a new category is a one-file
 *   change (this file) plus tagging the relevant tools in the registry.
 *
 * Categories
 *
 *   USER-TOGGLEABLE (8):
 *     - create_record       — create_lead/contact/deal/company
 *     - update_record       — update_entity, update_note, update_reminder, update_pipeline_stage etc
 *     - delete_record       — delete_entity, delete_note, delete_saved_view etc
 *     - convert_record      — convert_lead, revert_contact
 *     - send_message        — send_message, draft_message, draft_proposal
 *     - manage_participants — add_participants, remove_participant, add_person_to_company,
 *                             remove_person_from_company
 *     - schedule            — create_followup, update_reminder
 *     - files               — remove_file, update_file_tags
 *
 *   HARD-LOCKED (3 — surfaced read-only in the settings UI):
 *     - bulk     — bulk_update_entities, bulk_close_deals, import_csv (blast radius)
 *     - settings — workspace-config edits (org settings, fields, templates,
 *                  pipelines, tags, views, categories — affect everyone)
 *     - members  — invitations, role changes, removals (identity / access)
 *
 *   ALWAYS-ASK (1 — synthetic):
 *     - ask_user — ask_user_input, ask_user_choice. These ARE the
 *       question-asking mechanism; auto-approving them defeats the point.
 *       Tools mark `alwaysAsk: true` instead of relying on this category.
 */

// ─── Category enum ────────────────────────────────────────────────────────

/**
 * Every category surfaced in user-facing settings. Adding a new entry here
 * makes:
 *   - `users.preferences.aiApprovals` schema accept the key (extend
 *     `convex/schema/identity.ts` in the same change).
 *   - `updateAiApprovals` mutation accept the key (extend
 *     `convex/users/mutations.ts`).
 *   - The settings UI render a toggle row for the key (extend
 *     `AIApprovalsSection.tsx`).
 *   - `AUTO_APPROVE_DEFAULTS` need a default boolean.
 */
export const USER_TOGGLEABLE_CATEGORIES = [
	"create_record",
	"update_record",
	"delete_record",
	"convert_record",
	"send_message",
	"manage_participants",
	"schedule",
	"files",
] as const;
export type UserToggleableCategory = (typeof USER_TOGGLEABLE_CATEGORIES)[number];

/**
 * Categories that ALWAYS require the propose/commit card regardless of
 * user preferences. Surfaced in the settings UI as read-only rows so the
 * user can see what's locked and why. Adding to this set is a defence-in-
 * depth lever — once locked, no preference UI can bypass it.
 */
export const HARD_LOCKED_CATEGORIES = ["bulk", "settings", "members"] as const;
export type HardLockedCategory = (typeof HARD_LOCKED_CATEGORIES)[number];

/**
 * Full enum used on `ToolDef.approvalCategory`. Includes the synthetic
 * `ask_user` value used by `ask_user_input` / `ask_user_choice` so the
 * registry can introspect tools by category without having to special-case.
 */
export const ALL_APPROVAL_CATEGORIES = [
	...USER_TOGGLEABLE_CATEGORIES,
	...HARD_LOCKED_CATEGORIES,
	"ask_user",
] as const;
export type ApprovalCategory = (typeof ALL_APPROVAL_CATEGORIES)[number];

// ─── Defaults ─────────────────────────────────────────────────────────────

/**
 * Defaults for the user-toggleable categories. `true` means SKIP the
 * confirmation card by default; `false` means ALWAYS show it.
 *
 * Chosen 2026-05-26 with the user:
 *   - Creates + deletes still gate by default — single create still shows
 *     the preview card, deletes still confirm cascade impact.
 *   - Updates / converts / messages / schedule / participant ops
 *     auto-approve by default (these are the high-frequency low-risk ops).
 *
 * Adjusted 2026-05-28 (Stage 0 of DASHBOARD-V2-PLAN.md):
 *   - `files` flipped from `true` → `false`. With `true` a propose payload
 *     was stashed by `wrapToolsForApprovalSanitisation` BUT
 *     `stopOnAnyTwoStepCall` honoured the auto-approve and never halted
 *     the loop, so `commit_attach_file` never ran and the file remained
 *     scoped to `aiChat` instead of being re-scoped to the target person
 *     / deal / company. Net effect: the user's file disappeared from the
 *     person's Files tab. Flipping to `false` surfaced the propose card
 *     so the user's existing approve-button flow finished the attach.
 *
 * Adjusted 2026-05-28 (Stage 0.5 of DASHBOARD-V2-PLAN.md):
 *   - `files` flipped back to `true`. The Stage 0.5 commit-shim in
 *     `convex/ai/orchestrator/streamLoop.ts:wrapToolsForApprovalSanitisation`
 *     closes the silent-drop class of bug at the wrapper layer: when
 *     `resolveNeedsApproval(...) === false` AND a propose shape is
 *     returned, the wrapper now looks up `commit_<tool>` via
 *     `getRegisteredTool` and runs its `execute()` directly, returning
 *     the commit's real summary to the SDK. The model sees the actual
 *     outcome; the file is re-scoped in the same round-trip. Mirrors
 *     `resume.ts`'s post-user-approval path so both flows (auto +
 *     manual) produce identical commits.
 *
 * Hard-locked categories aren't in this map because they're not togglable.
 */
export const AUTO_APPROVE_DEFAULTS: Record<UserToggleableCategory, boolean> = {
	create_record: false,
	update_record: true,
	delete_record: false,
	convert_record: true,
	send_message: true,
	manage_participants: true,
	schedule: true,
	files: true,
};

// ─── Resolver ─────────────────────────────────────────────────────────────

/**
 * Apply the user's stored preferences over the defaults. Returns the
 * effective auto-approve map the gate logic consumes.
 *
 * Precedence: explicit `false` from user > explicit `true` from user >
 * default. (Both explicit values override the default; the resolver is a
 * straightforward `userPref ?? default` per category.)
 *
 * Hard-locked categories never appear in the returned map — they're
 * filtered upstream by `resolveNeedsApproval`.
 */
export function resolveEffectiveAutoApprove(
	userPref: Partial<Record<UserToggleableCategory, boolean>> | undefined | null,
): Record<UserToggleableCategory, boolean> {
	const pref = userPref ?? {};
	const out = {} as Record<UserToggleableCategory, boolean>;
	for (const key of USER_TOGGLEABLE_CATEGORIES) {
		const v = pref[key];
		out[key] = typeof v === "boolean" ? v : AUTO_APPROVE_DEFAULTS[key];
	}
	return out;
}

/**
 * Type-guard for membership in the hard-locked set. Cheap to call from
 * `resolveNeedsApproval` on every tool call.
 */
export function isHardLockedCategory(c: string | undefined): c is HardLockedCategory {
	if (!c) return false;
	return (HARD_LOCKED_CATEGORIES as readonly string[]).includes(c);
}

/**
 * Type-guard for membership in the user-toggleable set. Used by the
 * mutation to accept only valid keys.
 */
export function isUserToggleableCategory(c: string | undefined): c is UserToggleableCategory {
	if (!c) return false;
	return (USER_TOGGLEABLE_CATEGORIES as readonly string[]).includes(c);
}

// ─── UI display metadata ──────────────────────────────────────────────────

/**
 * Friendly label + one-sentence description for each category. Imported by
 * `AIApprovalsSection.tsx`. Kept in this file so a category rename happens
 * in exactly one place.
 */
export const CATEGORY_DISPLAY: Record<
	UserToggleableCategory | HardLockedCategory,
	{ label: string; description: string }
> = {
	create_record: {
		label: "Create records",
		description:
			"Single create of a lead, contact, deal, or company. When auto-approved, the AI writes directly without showing the preview card.",
	},
	update_record: {
		label: "Update records",
		description:
			"Edit fields on existing leads, contacts, deals, companies, notes, reminders, or pipeline stages.",
	},
	delete_record: {
		label: "Delete records",
		description:
			"Soft-delete leads, contacts, deals, companies, notes, or saved views. Deletes are reversible from the trash for 30 days.",
	},
	convert_record: {
		label: "Convert / revert",
		description:
			"Convert a lead into a contact, or revert a contact back to a lead. Code prefix is preserved across the boundary.",
	},
	send_message: {
		label: "Send messages",
		description:
			"Send a chat message to a person, deal, company, or conversation. Drafts (draft_message, draft_proposal) also fall under this category — drafts NEVER auto-send regardless.",
	},
	manage_participants: {
		label: "Manage participants",
		description:
			"Add or remove people from conversations and link or unlink people from companies.",
	},
	schedule: {
		label: "Schedule reminders / follow-ups",
		description:
			"Create or edit reminders and follow-ups. Includes pushing dates and reassigning.",
	},
	files: {
		label: "File operations",
		description:
			"Soft-delete files or update their tags. Storage blob is retained for recovery.",
	},
	bulk: {
		label: "Bulk operations",
		description:
			"Always asks for approval — workspace policy. Bulk operations have unbounded blast radius (can affect dozens or hundreds of records in one call).",
	},
	settings: {
		label: "Workspace settings",
		description:
			"Always asks for approval — workspace policy. Edits to org settings, custom fields, pipelines, templates, tags, saved views, or note categories affect every member.",
	},
	members: {
		label: "Members & invitations",
		description:
			"Always asks for approval — workspace policy. Identity and access changes (invite, revoke, role change) require a deliberate human step.",
	},
};
