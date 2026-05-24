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
