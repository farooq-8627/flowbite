/**
 * Org-level capabilities — settings + members + roles.
 *
 * Surface registered here:
 *   - update_org_settings        change defaultCurrency / timezone /
 *                                modules slot map / fileUpload / taskDefaults
 *   - set_entity_default_view    flip a CRM module's defaultView (list/board)
 *   - rename_entity_labels       change `{Lead}`/`{Deal}`/etc. labels + slugs
 *   - invite_member              create a pending invitation
 *   - change_member_role         move a member to a different role
 *   - remove_member              soft-delete a member
 *   - create_role                add a custom role
 *   - update_role                edit a custom role's permissions
 *   - delete_role                remove a custom role + reassign holders
 *
 * Risk policy (S10):
 *   safe         — none here, all writes
 *   reversible   — invite_member, create_role, update_role
 *   irreversible — settings edits + role/role-permission changes that
 *                  affect access + member removal. Per the locked
 *                  decision in PART 2 §2.1 these are 2FA-fenced and
 *                  blocked over WhatsApp.
 */

import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { defineCapability } from "../ai/registry/define";
import { defineGroup } from "../ai/registry/groups";
import { failed, ok } from "../ai/registry/result";

// ─── Group playbooks ─────────────────────────────────────────────────────────

defineGroup({
	name: "settings",
	playbook: `Workspace settings edits are IRREVERSIBLE — they reshape the org's data shape (entity labels, slugs, module defaults). Every settings capability requires a 2FA step-up, blocked over WhatsApp. Always summarise the proposed change in the assistant text BEFORE the user confirms; never settle a change without naming what changed and what the previous value was.

Use \`update_org_settings\` for currency / timezone / softDeleteRetentionDays / taskDefaults / taskTypes / fileUpload edits. Use \`set_entity_default_view\` to flip a slot's defaultView. Use \`rename_entity_labels\` for renaming "Lead" → "Inquiry" etc. (slugs validated against the SSOT reserved-slug list). The dashboardLayout is per-org via the platform-owner panel — locked decision #13 — the AI does NOT write the canonical dashboard layout from chat.`,
});

defineGroup({
	name: "members",
	playbook: `Member + role management is IRREVERSIBLE for everything except inviting. \`remove_member\` soft-deletes a member but immediately revokes their access; \`change_member_role\` can grant high-permission keys; \`create_role\` / \`update_role\` / \`delete_role\` reshape the permission surface. All of those require a 2FA step-up + are blocked over WhatsApp.

Use \`invite_member\` for new email invites (auto-emailed via Resend). Always confirm the role's name before inviting; the role is the lowest-permission role available unless the user names another. Never invite as Owner — that's a creator-only role.`,
});

// ─── Settings capabilities ──────────────────────────────────────────────────

const ALLOWED_SETTING_KEYS = new Set([
	"defaultCurrency",
	"timezone",
	"leadStaleAfterDays",
	"badgeCountsVisible",
	"codePrefixes",
	"taskDefaults",
	"taskTypes",
	"briefingDefaults",
	"fileUpload",
	"softDeleteRetentionDays",
]);

const updateOrgSettings = defineCapability<{
	settings: Record<string, unknown>;
}>({
	name: "update_org_settings",
	module: "core",
	group: "settings",
	permission: "org.editSettings",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Edit a top-level org settings field (currency, timezone, lead stale-after-days, code prefixes, task defaults, task-type catalog, file-upload caps, soft-delete retention). Allowed keys: defaultCurrency, timezone, leadStaleAfterDays, badgeCountsVisible, codePrefixes, taskDefaults, taskTypes, briefingDefaults, fileUpload, softDeleteRetentionDays.",
		whenNotToCall:
			"the user wants to flip an entity's default view (use set_entity_default_view), rename a label (use rename_entity_labels), or change the dashboard layout (locked — not AI-writable per decision #13).",
		requiredClarifications: ["settings"],
		synonyms: ["change settings", "set currency", "update workspace config"],
		goodExample: { settings: { defaultCurrency: "USD", timezone: "America/New_York" } },
		badExample: {
			args: { settings: { entitySettings: { lead: { view: "board" } } } },
			why: "entitySettings is not a top-level settings key. Use set_entity_default_view to flip a slot's view.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with `<key>: <new value>` per change. Mention the prior value when you can read it back.",
		onValidationError:
			"Read repair.field — typically an unknown key. Re-call with the allowed keys only.",
	},
	input: z.object({
		settings: z
			.record(z.string(), z.unknown())
			.refine((r) => Object.keys(r).length > 0, {
				message: "Pass at least one setting to change.",
			})
			.describe(
				"Object of allowed top-level settings keys (defaultCurrency, timezone, leadStaleAfterDays, badgeCountsVisible, codePrefixes, taskDefaults, taskTypes, briefingDefaults, fileUpload, softDeleteRetentionDays).",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const filtered: Record<string, unknown> = {};
		const dropped: string[] = [];
		for (const [k, v] of Object.entries(args.settings)) {
			if (ALLOWED_SETTING_KEYS.has(k)) filtered[k] = v;
			else dropped.push(k);
		}
		if (Object.keys(filtered).length === 0) {
			return failed(
				"business_error",
				`None of the supplied keys are settable via this tool: ${dropped.join(", ")}.`,
			);
		}
		await ctx.runMutation(internal.orgs.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			settings: filtered,
		});
		const changes = Object.entries(filtered).map(([key, value]) => ({
			label: key,
			value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
			emphasis: "changed" as const,
		}));
		const facts =
			dropped.length > 0 ? [`Skipped (not allowed): ${dropped.join(", ")}.`] : undefined;
		return ok({
			headline: `Updated workspace settings (${Object.keys(filtered).length} key${Object.keys(filtered).length === 1 ? "" : "s"}).`,
			changes,
			facts,
			data: { applied: Object.keys(filtered), dropped },
		});
	},
});

const setEntityDefaultView = defineCapability<{
	views: Partial<Record<"lead" | "contact" | "deal" | "company", "list" | "board">>;
}>({
	name: "set_entity_default_view",
	module: "core",
	group: "settings",
	permission: "org.editSettings",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Flip the default view for one or more CRM entity slots (lead/contact/deal/company) between 'list' and 'board'. Routes through `orgs.update` and merges into the existing `org.settings.modules` array so other slot fields (label, hidden, order, cardFields) are preserved.",
		whenNotToCall: "the user wants to rename an entity (use rename_entity_labels).",
		requiredClarifications: ["views"],
		goodExample: { views: { lead: "board", deal: "board" } },
	},
	drive: {
		onSuccess: "Confirm '<entity> defaultView: <list|board>' per slot.",
	},
	input: z.object({
		views: z
			.object({
				lead: z.enum(["list", "board"]).optional(),
				contact: z.enum(["list", "board"]).optional(),
				deal: z.enum(["list", "board"]).optional(),
				company: z.enum(["list", "board"]).optional(),
			})
			.refine((v) => Object.values(v).some((x) => x !== undefined), {
				message: "Pass at least one entity view to change.",
			}),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// Read current modules array.
		const snapshot = (await ctx.runQuery(internal.orgs.queries.getOrgModulesForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as Array<{
			slot: string;
			label?: string;
			hidden?: boolean;
			order?: number;
			defaultView?: "list" | "board";
			cardFields?: string[];
			listColumns?: string[];
			boardGroupBy?: string;
			defaultFilters?: string[];
			meta?: unknown;
		}> | null;
		const existing = snapshot ?? [];
		const merged: typeof existing = [];
		const slotsTouched = new Set<string>();
		for (const slot of existing) {
			const desired = args.views[slot.slot as keyof typeof args.views];
			if (desired) {
				slotsTouched.add(slot.slot);
				merged.push({ ...slot, defaultView: desired });
			} else {
				merged.push(slot);
			}
		}
		// Add slots the user named that weren't previously in the array.
		for (const [k, v] of Object.entries(args.views)) {
			if (!v) continue;
			if (slotsTouched.has(k)) continue;
			if (existing.find((s) => s.slot === k)) continue;
			merged.push({ slot: k, defaultView: v });
			slotsTouched.add(k);
		}
		await ctx.runMutation(internal.orgs.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			settings: { modules: merged },
		});
		const changes = Array.from(slotsTouched).map((slot) => ({
			label: slot,
			value: args.views[slot as keyof typeof args.views] ?? "",
			emphasis: "changed" as const,
		}));
		return ok({
			headline: `Updated default view for ${slotsTouched.size} entit${slotsTouched.size === 1 ? "y" : "ies"}.`,
			changes,
		});
	},
});

const renameEntityLabels = defineCapability<{
	labels: Partial<
		Record<
			"lead" | "contact" | "deal" | "company",
			{ singular: string; plural: string; slug: string }
		>
	>;
}>({
	name: "rename_entity_labels",
	module: "core",
	group: "settings",
	permission: "org.editSettings",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Rename a CRM entity's display label and URL slug (Lead → Inquiry, Deal → Opportunity). Slugs are validated against the SSOT reserved-slugs list — pick a slug that doesn't conflict with platform routes.",
		whenNotToCall:
			"only flipping list/board view (use set_entity_default_view) or changing org-wide settings.",
		requiredClarifications: ["labels"],
		goodExample: {
			labels: { lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" } },
		},
	},
	drive: {
		onSuccess:
			"Confirm 'lead → Inquiry / inquiries / inquiries' (singular / plural / slug) per slot.",
	},
	input: z.object({
		labels: z
			.object({
				lead: z
					.object({
						singular: z.string().min(1),
						plural: z.string().min(1),
						slug: z.string().min(1),
					})
					.optional(),
				contact: z
					.object({
						singular: z.string().min(1),
						plural: z.string().min(1),
						slug: z.string().min(1),
					})
					.optional(),
				deal: z
					.object({
						singular: z.string().min(1),
						plural: z.string().min(1),
						slug: z.string().min(1),
					})
					.optional(),
				company: z
					.object({
						singular: z.string().min(1),
						plural: z.string().min(1),
						slug: z.string().min(1),
					})
					.optional(),
			})
			.refine((v) => Object.values(v).some((x) => x !== undefined), {
				message: "Pass at least one entity label to rename.",
			}),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.orgs.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityLabels: args.labels,
		});
		const changes = Object.entries(args.labels)
			.filter(([, v]) => v !== undefined)
			.map(([slot, label]) => ({
				label: slot,
				value: `${label?.singular} / ${label?.plural} / ${label?.slug}`,
				emphasis: "changed" as const,
			}));
		return ok({
			headline: `Renamed ${changes.length} entit${changes.length === 1 ? "y" : "ies"}.`,
			changes,
		});
	},
});

// ─── Members capabilities ───────────────────────────────────────────────────

const inviteMember = defineCapability<{
	email: string;
	roleId: string;
}>({
	name: "invite_member",
	module: "core",
	group: "members",
	permission: "members.invite",
	risk: "reversible", // pending invite — cancellable with `cancel_invitation`.
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Send a workspace invitation to an email address with a specific role. The invitee receives a one-shot accept link valid for 48 hours.",
		whenNotToCall:
			"the email is already a member (the underlying mutation throws ALREADY_MEMBER) or the user wants to assign Owner (Owner is creator-only — never invite-able).",
		requiredClarifications: ["email", "roleId"],
		synonyms: ["invite to workspace", "add a teammate", "send invite"],
		goodExample: { email: "alex@example.com", roleId: "<roleId>" },
	},
	drive: {
		onSuccess:
			"Confirm 'Invited <email> as <roleName>'. Mention the link is one-shot + expires in 48 hours.",
		onValidationError:
			"Use describe_workspace or list_org_roles (when ported) to find the right roleId before retrying.",
	},
	input: z.object({
		email: z.string().email().describe("Email address to invite."),
		roleId: z
			.string()
			.min(1)
			.describe("orgRoles row id. Find via describe_workspace or list_org_roles."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(internal.invitations.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			email: args.email,
			roleId: args.roleId as Id<"orgRoles">,
		})) as { invitationId: string; token: string; acceptUrl: string };
		return ok({
			headline: `Invited ${args.email}.`,
			changes: [
				{ label: "Email", value: args.email, emphasis: "added" },
				{ label: "Status", value: "pending", emphasis: "added" },
			],
			facts: ["The invite link is one-shot and expires in 48 hours."],
			data: { invitationId: result.invitationId },
		});
	},
});

const changeMemberRole = defineCapability<{
	targetUserId: string;
	roleId: string;
}>({
	name: "change_member_role",
	module: "core",
	group: "members",
	permission: "members.changeRole",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Change an existing member's role. Both the target user and the role must already exist in the org.",
		whenNotToCall:
			"the user wants to remove a member (use remove_member) or invite a new one (use invite_member).",
		requiredClarifications: ["targetUserId", "roleId"],
		goodExample: { targetUserId: "<userId>", roleId: "<orgRolesId>" },
	},
	drive: {
		onSuccess: "Confirm 'Changed <user> to <roleName>'.",
	},
	input: z.object({
		targetUserId: z.string().min(1).describe("users row id."),
		roleId: z.string().min(1).describe("orgRoles row id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.orgs.mutations.updateMemberRoleForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			targetUserId: args.targetUserId as Id<"users">,
			roleId: args.roleId as Id<"orgRoles">,
		});
		return ok({
			headline: `Changed member role.`,
			changes: [{ label: "Role", value: args.roleId, emphasis: "changed" }],
		});
	},
});

const removeMember = defineCapability<{
	targetUserId: string;
}>({
	name: "remove_member",
	module: "core",
	group: "members",
	permission: "members.remove",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall: "Soft-delete a member — they immediately lose workspace access.",
		whenNotToCall:
			"the target is the last Owner (the underlying mutation refuses) or the user is leaving themselves (use a self-leave UI flow).",
		requiredClarifications: ["targetUserId"],
		goodExample: { targetUserId: "<userId>" },
	},
	drive: {
		onSuccess: "Confirm 'Removed <user>'. Note that re-inviting them creates a fresh invite.",
	},
	input: z.object({
		targetUserId: z.string().min(1).describe("users row id of the member to remove."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.orgs.mutations.removeMemberForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			targetUserId: args.targetUserId as Id<"users">,
		});
		return ok({
			headline: `Removed member.`,
			changes: [{ label: "userId", value: args.targetUserId, emphasis: "changed" }],
		});
	},
});

// ─── Roles capabilities ─────────────────────────────────────────────────────

const createRole = defineCapability<{
	name: string;
	description?: string;
	permissions: string[];
	color?: string;
}>({
	name: "create_role",
	module: "core",
	group: "members",
	permission: "members.changeRole",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a custom role with a specific permission set. Permission keys must come from the canonical catalog.",
		whenNotToCall:
			"editing an existing role (use update_role) or renaming a system role (Owner/Admin/Member can't be renamed).",
		requiredClarifications: ["name", "permissions"],
		goodExample: {
			name: "Read-only Sales",
			permissions: ["leads.view", "deals.view", "companies.view", "contacts.view"],
		},
	},
	drive: {
		onSuccess: "Confirm '<name> role created with N permissions'.",
	},
	input: z.object({
		name: z.string().min(1).describe("Role display name. Must be unique in the org."),
		description: z.string().optional(),
		permissions: z.array(z.string()).min(1).describe("Permission keys from the catalog."),
		color: z.string().optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const roleId = (await ctx.runMutation(internal.orgRoles.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			name: args.name,
			description: args.description,
			permissions: args.permissions,
			color: args.color,
		})) as string;
		return ok({
			headline: `Created role "${args.name}" with ${args.permissions.length} permission${args.permissions.length === 1 ? "" : "s"}.`,
			data: { roleId },
		});
	},
});

const updateRole = defineCapability<{
	roleId: string;
	name?: string;
	description?: string;
	permissions?: string[];
	color?: string;
}>({
	name: "update_role",
	module: "core",
	group: "members",
	permission: "members.changeRole",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall: "Edit an existing custom role's name, description, permissions, or colour.",
		whenNotToCall: "renaming a system role (Owner/Admin/Member — refused at the mutation).",
		requiredClarifications: ["roleId"],
		goodExample: { roleId: "<orgRolesId>", permissions: ["leads.view", "deals.view"] },
	},
	drive: {
		onSuccess:
			"Confirm 'Updated <name>' and list the keys whose values changed. If permissions changed, name the count.",
	},
	input: z.object({
		roleId: z.string().min(1),
		name: z.string().optional(),
		description: z.string().optional(),
		permissions: z.array(z.string()).optional(),
		color: z.string().optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.orgRoles.mutations.updateForAI, {
			userId: principal.userId,
			roleId: args.roleId as Id<"orgRoles">,
			name: args.name,
			description: args.description,
			permissions: args.permissions,
			color: args.color,
		});
		const changedKeys = (["name", "description", "permissions", "color"] as const).filter(
			(k) => args[k] !== undefined,
		);
		return ok({
			headline: `Updated role.`,
			changes: changedKeys.map((k) => ({
				label: k,
				value: Array.isArray(args[k])
					? `${(args[k] as unknown[]).length} entries`
					: String(args[k] ?? ""),
				emphasis: "changed" as const,
			})),
		});
	},
});

const deleteRole = defineCapability<{
	roleId: string;
}>({
	name: "delete_role",
	module: "core",
	group: "members",
	permission: "members.changeRole",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Delete a custom role. Members holding the role are reassigned to the org's default role automatically.",
		whenNotToCall:
			"the target is a system role (Owner/Admin/Member) — the underlying mutation refuses with 'Cannot delete a system role.'",
		requiredClarifications: ["roleId"],
		goodExample: { roleId: "<orgRolesId>" },
	},
	drive: {
		onSuccess:
			"Confirm 'Deleted role <name>'. Mention that holders were reassigned to the default role.",
	},
	input: z.object({
		roleId: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.orgRoles.mutations.removeForAI, {
			userId: principal.userId,
			roleId: args.roleId as Id<"orgRoles">,
		});
		return ok({
			headline: `Deleted role.`,
			changes: [{ label: "roleId", value: args.roleId, emphasis: "changed" }],
		});
	},
});

export const ORG_ADMIN_CAPABILITIES = [
	updateOrgSettings,
	setEntityDefaultView,
	renameEntityLabels,
	inviteMember,
	changeMemberRole,
	removeMember,
	createRole,
	updateRole,
	deleteRole,
];
