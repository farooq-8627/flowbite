/**
 * convex/ai/tools/layers/members.ts — Member + invitation management tools.
 *
 * Hard-blocked: AI cannot promote the calling user to a higher role (self-promotion).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setMembersContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("members ctx");
	return _ctx;
}

registerTool({
	name: "invite_member",
	layer: "members",
	permission: "members.invite",
	confirmation: "twoStep",
	description: "Send an invitation to join the workspace.",
	runbook: {
		onSuccess: "Confirm with the email and the role they were invited as.",
		onValidationError:
			"If email format is invalid or roleId doesn't exist, ask for a valid value.",
		onPermissionDenied:
			"Tell the user they need members.invite permission. Suggest contacting an admin.",
	},
	schema: z.object({
		email: z.string().email(),
		roleId: z.string().describe("orgRoles id"),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.invite");
		return propose("invite_member", args, {
			title: `Invite ${args.email}`,
			fields: [
				{ label: "Email", value: args.email },
				{ label: "Role", value: args.roleId },
			],
		});
	},
});

registerTool({
	name: "commit_invite_member",
	layer: "members",
	permission: "members.invite",
	confirmation: "none",
	description: "Internal: commit invitation.",
	schema: z.object({ email: z.string(), roleId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "members.invite");
			const result = await toolMutation(getCtx(), "invitations/mutations:create", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `📧 Invitation sent to ${args.email}.`,
			};
		}),
});

registerTool({
	name: "cancel_invitation",
	layer: "members",
	permission: "members.cancelInvitation",
	confirmation: "twoStep",
	description: "Cancel a pending invitation.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
	},
	schema: z.object({ invitationId: z.string(), email: z.string().describe("For preview") }),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.cancelInvitation");
		return propose("cancel_invitation", args, {
			title: `Cancel invitation to ${args.email}`,
			fields: [{ label: "Email", value: args.email }],
		});
	},
});

registerTool({
	name: "commit_cancel_invitation",
	layer: "members",
	permission: "members.cancelInvitation",
	confirmation: "none",
	description: "Internal: commit invitation cancellation.",
	schema: z.object({ invitationId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "members.cancelInvitation");
			await toolMutation(getCtx(), "invitations/mutations:cancel", { orgId, ...args });
			return { ok: true as const, data: args, display: `✅ Invitation cancelled.` };
		}),
});

registerTool({
	name: "change_member_role",
	layer: "members",
	permission: "members.changeRole",
	requiredCapability: "premium",
	confirmation: "twoStep",
	description:
		"Change a member's role. AI cannot promote the calling user (self-promotion blocked).",
	runbook: {
		onSuccess: "Confirm with the member's name and new role.",
		onPermissionDenied:
			"If the user is trying to change their own role, tell them another admin must do it. Otherwise tell them they need members.changeRole permission.",
	},
	schema: z.object({
		userId: z.string().describe("Target user id."),
		newRoleId: z.string().describe("New orgRoles id."),
	}),
	execute: async (args) => {
		const { permissions, userId: callingUser } = getCtx();
		requirePermission(permissions, "members.changeRole");
		// Hard-block self-promotion
		if (args.userId === callingUser) {
			return {
				ok: false as const,
				error: "AI cannot change your own role. Please ask another admin.",
			};
		}
		return propose("change_member_role", args, {
			title: `Change role for ${args.userId}`,
			fields: [
				{ label: "User", value: args.userId },
				{ label: "New role", value: args.newRoleId },
			],
		});
	},
});

registerTool({
	name: "commit_change_member_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "none",
	description: "Internal: commit role change. Self-promotion still blocked.",
	schema: z.object({ userId: z.string(), newRoleId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions, userId: callingUser } = getCtx();
			requirePermission(permissions, "members.changeRole");
			if (args.userId === callingUser) {
				return { ok: false as const, error: "AI cannot change your own role." };
			}
			await toolMutation(getCtx(), "orgs/mutations:updateMemberRole", {
				orgId,
				targetUserId: args.userId,
				roleId: args.newRoleId,
			});
			return { ok: true as const, data: args, display: `✅ Role updated.` };
		}),
});

registerTool({
	name: "remove_member",
	layer: "members",
	permission: "members.remove",
	requiredCapability: "premium",
	confirmation: "twoStep",
	description: "Remove a member from the workspace.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
		onPermissionDenied:
			"If the user is trying to remove themselves, tell them another admin must do it.",
	},
	schema: z.object({ userId: z.string(), name: z.string().describe("For preview") }),
	execute: async (args) => {
		const { permissions, userId: callingUser } = getCtx();
		requirePermission(permissions, "members.remove");
		if (args.userId === callingUser) {
			return { ok: false as const, error: "AI cannot remove you from the workspace." };
		}
		return propose("remove_member", args, {
			title: `Remove ${args.name} from workspace`,
			fields: [{ label: "Member", value: args.name }],
		});
	},
});

registerTool({
	name: "commit_remove_member",
	layer: "members",
	permission: "members.remove",
	confirmation: "none",
	description: "Internal: commit member removal.",
	schema: z.object({ userId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions, userId: callingUser } = getCtx();
			requirePermission(permissions, "members.remove");
			if (args.userId === callingUser) {
				return { ok: false as const, error: "AI cannot remove you." };
			}
			await toolMutation(getCtx(), "orgs/mutations:removeMember", {
				orgId,
				targetUserId: args.userId,
			});
			return { ok: true as const, data: args, display: `✅ Member removed.` };
		}),
});

// ─── Stage 4 — resend_invitation (twoStep) ───────────────────────────────────

const resendSchema = z.object({
	invitationId: z.string().describe("Convex invitations _id."),
	email: z.string().describe("Recipient email (for the propose card)."),
});

registerTool({
	name: "resend_invitation",
	layer: "members",
	permission: "members.invite",
	confirmation: "twoStep",
	description:
		"Resend an existing pending invitation — regenerates the token, extends expiry, re-fires the email. Two-step.",
	instruction: {
		whenToCall:
			"User asks to resend / re-send an invitation that's still pending. Refuses if the invitation is already accepted, declined, or cancelled.",
		whenNotToCall:
			"the user wants to send a NEW invitation (use invite_member) OR cancel the existing one (use cancel_invitation).",
		preflight: ["list_members"],
		requiredClarifications: ["invitationId"],
		synonyms: ["resend invite", "re-send invitation", "send invite again"],
		goodExample: {
			description: "User: 'Resend the invite to bob@acme.com — they say they never got it.'",
			args: { invitationId: "abc123", email: "bob@acme.com" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence — invitation resent.",
		onValidationError:
			"If the mutation throws INVITATION_ALREADY_USED, the invite is no longer pending. Suggest creating a new invitation via invite_member.",
	},
	schema: resendSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.invite");
		return propose("resend_invitation", args, {
			title: `Resend invitation to ${args.email}`,
			fields: [{ label: "Email", value: args.email }],
		});
	},
});

registerTool({
	name: "commit_resend_invitation",
	layer: "members",
	permission: "members.invite",
	confirmation: "none",
	description: "Internal: commit a pre-approved invitation resend.",
	schema: resendSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "members.invite");
			await toolMutation(getCtx(), "invitations/mutations:resend", {
				orgId,
				invitationId: args.invitationId,
			});
			return {
				ok: true as const,
				data: args,
				display: `📧 Invitation resent to ${args.email}.`,
			};
		}),
});

// ─── Stage 4 — Custom role CRUD (create / update / delete, twoStep) ──────────

const createRoleSchema = z.object({
	name: z.string().min(1).describe("Role name (must be unique within the org)."),
	description: z.optional(z.string()),
	permissions: z
		.array(z.string())
		.describe("Permission keys this role grants. Use list_my_permissions to see the catalog."),
	isDefault: z
		.optional(z.boolean())
		.describe("If true, becomes the default role for newly-invited members."),
	color: z.optional(z.string()).describe("Optional hex colour for the role chip."),
});

registerTool({
	name: "create_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "twoStep",
	description:
		"Create a new custom role for the workspace. Two-step — surfaces name + permission count first.",
	instruction: {
		whenToCall:
			"User asks to create a new role (e.g. 'add a Sales Manager role with deal access').",
		whenNotToCall:
			"the user wants to assign an existing role (use change_member_role) OR edit an existing role (use update_custom_role).",
		preflight: ["list_my_permissions"],
		requiredClarifications: ["name", "permissions"],
		synonyms: ["new role", "create role", "add role"],
		goodExample: {
			description:
				"User: 'Create a Read-only role with leads.view, deals.view, contacts.view.'",
			args: {
				name: "Read-only",
				permissions: ["leads.view", "deals.view", "contacts.view"],
			},
		},
	},
	runbook: {
		onSuccess: "Confirm with the new role name and permission count in one short sentence.",
		onValidationError:
			"If a role with this name already exists, ask for a different name OR use update_custom_role on the existing one.",
	},
	schema: createRoleSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.changeRole");
		return propose("create_custom_role", args, {
			title: `Create role: ${args.name}`,
			fields: [
				{ label: "Name", value: args.name },
				{ label: "Permissions", value: `${args.permissions.length} key(s)` },
				...(args.isDefault ? [{ label: "Default", value: "yes" }] : []),
			],
		});
	},
});

registerTool({
	name: "commit_create_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "none",
	description: "Internal: commit a pre-approved role creation.",
	schema: createRoleSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "members.changeRole");
			const result = await toolMutation(getCtx(), "orgRoles/mutations:create", {
				orgId,
				name: args.name,
				description: args.description,
				permissions: args.permissions,
				isDefault: args.isDefault,
				color: args.color,
			});
			return {
				ok: true as const,
				data: result,
				display: `✅ Role "${args.name}" created with ${args.permissions.length} permission(s).`,
			};
		}),
});

const updateRoleSchema = z.object({
	roleId: z.string().describe("Convex orgRoles _id."),
	name: z.optional(z.string().min(1)),
	description: z.optional(z.string()),
	permissions: z.optional(z.array(z.string())),
	isDefault: z.optional(z.boolean()),
	color: z.optional(z.string()),
});

registerTool({
	name: "update_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "twoStep",
	description: "Update a custom role's permissions, name, colour, or default flag. Two-step.",
	instruction: {
		whenToCall:
			"User asks to edit / modify / change permissions on an existing role. System roles cannot be renamed (the mutation refuses) but their permissions and colour can be edited.",
		whenNotToCall:
			"the user wants to delete the role (use delete_custom_role) OR create a new one (use create_custom_role).",
		preflight: ["list_my_permissions"],
		requiredClarifications: ["roleId"],
		synonyms: ["edit role", "change role permissions", "modify role"],
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the changed fields.",
		onValidationError:
			"If the mutation refuses on a system-role rename, tell the user system role names are fixed and only permissions/colour can be edited.",
	},
	schema: updateRoleSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.changeRole");
		const fields: Array<{ label: string; value: string }> = [
			{ label: "Role", value: args.roleId },
		];
		if (args.name !== undefined) fields.push({ label: "Name", value: args.name });
		if (args.permissions !== undefined)
			fields.push({ label: "Permissions", value: `${args.permissions.length} key(s)` });
		if (args.isDefault !== undefined)
			fields.push({ label: "Default", value: args.isDefault ? "yes" : "no" });
		if (args.color !== undefined) fields.push({ label: "Color", value: args.color });
		return propose("update_custom_role", args, {
			title: "Update custom role",
			fields,
		});
	},
});

registerTool({
	name: "commit_update_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "none",
	description: "Internal: commit a pre-approved role update.",
	schema: updateRoleSchema,
	execute: async (args) =>
		runTool(async () => {
			const { permissions } = getCtx();
			requirePermission(permissions, "members.changeRole");
			await toolMutation(getCtx(), "orgRoles/mutations:update", {
				roleId: args.roleId,
				name: args.name,
				description: args.description,
				permissions: args.permissions,
				isDefault: args.isDefault,
				color: args.color,
			});
			return {
				ok: true as const,
				data: args,
				display: `✏️ Role updated.`,
			};
		}),
});

const deleteRoleSchema = z.object({
	roleId: z.string().describe("Convex orgRoles _id."),
	roleName: z.string().optional().describe("Role name (for the propose card)."),
});

registerTool({
	name: "delete_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "twoStep",
	description:
		"Delete a custom role. Members assigned to it are reassigned to the default role. System roles refuse deletion.",
	instruction: {
		whenToCall: "User asks to delete / remove a custom role.",
		whenNotToCall:
			"the user wants to edit it (use update_custom_role) OR remove a member (use remove_member).",
		requiredClarifications: ["roleId"],
		synonyms: ["delete role", "remove custom role"],
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the role name. Mention that affected members were reassigned to the default role.",
		onValidationError:
			"If the role is a system role, tell the user system roles cannot be deleted.",
	},
	schema: deleteRoleSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "members.changeRole");
		return propose("delete_custom_role", args, {
			title: `Delete role: ${args.roleName ?? args.roleId}`,
			fields: [
				{ label: "Role", value: args.roleName ?? args.roleId },
				{
					label: "Effect",
					value: "Members are reassigned to the default role.",
				},
			],
		});
	},
});

registerTool({
	name: "commit_delete_custom_role",
	layer: "members",
	permission: "members.changeRole",
	confirmation: "none",
	description: "Internal: commit a pre-approved role deletion.",
	schema: deleteRoleSchema,
	execute: async (args) =>
		runTool(async () => {
			const { permissions } = getCtx();
			requirePermission(permissions, "members.changeRole");
			await toolMutation(getCtx(), "orgRoles/mutations:remove", {
				roleId: args.roleId,
			});
			return {
				ok: true as const,
				data: args,
				display: `✅ Role "${args.roleName ?? "deleted"}".`,
			};
		}),
});
