/**
 * Projector dispatch — S16.
 *
 * The HTTP routes in `convex/http.ts` (`POST /ai/mcp` and
 * `POST /ai/rest/<cap>`) are V8 `httpAction`s that authenticate the
 * Bearer token, then hand off to one of these two internalActions for
 * the actual work:
 *
 *   - `dispatchMcpRequest`  — JSON-RPC frame in, JSON-RPC frame out.
 *   - `dispatchRestRequest` — REST path + body in, `{httpStatus, json}` out.
 *
 * Each action performs the side-effect imports that register every
 * domain's capabilities (mirrors `runtime/host.ts`'s import block but
 * stays V8 — no `"use node"` here). Then it builds a `CapabilityCtx`
 * around the verified principal + scopes and calls into the projector.
 *
 * Why split this from `host.ts`? The chat host is `"use node"` so it
 * can use the AI SDK + provider streaming. The MCP/REST surface doesn't
 * stream LLM output — it just runs ONE capability per request — so it
 * stays in V8 where Convex queries/mutations are reachable directly.
 */

import { v } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import { internalAction } from "../../../_generated/server";
import { listCapabilities } from "../define";
import type { Capability, CapabilityCtx, Channel, Principal } from "../types";
import { handleMcpRequest, type McpRpcResponse } from "./mcp";
import { type HandleRestOutput, handleRestRequest } from "./rest";

// Side-effect imports: register every domain's capabilities at module
// load. Exact mirror of `runtime/host.ts`'s import block — keep the two
// in sync so chat / MCP / REST see the SAME registry and the cross-channel
// parity invariant holds.
import "../../../crm/entities/leads/capabilities";
import "../../../crm/entities/deals/capabilities";
import "../../../crm/entities/companies/capabilities";
import "../../../crm/shared/tasks/capabilities";
import "../../../crm/shared/notes/capabilities";
import "../../../crm/shared/timeline/capabilities";
import "../../../notifications/capabilities";
import "../../../crm/fields/pipelines/capabilities";
import "../../../crm/fields/fieldDefinitions/capabilities";
import "../../../crm/shared/tags/capabilities";
import "../../../crm/shared/savedViews/capabilities";
import "../../../crm/shared/noteCategories/capabilities";
import "../../../orgs/capabilities";
import "../../../crm/shared/bulk/capabilities";
import "../../../messaging/capabilities";
import "../../../files/capabilities";
import "../../../dashboard/capabilities";
import "../../analytics/capabilities";
import "../../creative/capabilities";
import "../../interaction/capabilities";
import "../../proactive/capabilities";
import "../../quarantined/capabilities";
import "../../channels/capabilities";
import "../../channels/personaCapability";

// ─── Validators ─────────────────────────────────────────────────────────────

const channelValidator = v.union(v.literal("mcp"), v.literal("rest"));

const principalArgs = v.object({
	orgId: v.id("orgs"),
	userId: v.id("users"),
	permissions: v.array(v.string()),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCtxFromArgs(
	channel: Channel,
	principal: { orgId: Id<"orgs">; userId: Id<"users">; permissions: string[] },
	actionCtx: CapabilityCtx["ctx"],
): CapabilityCtx {
	const p: Principal = {
		kind: "member",
		userId: principal.userId,
		orgId: principal.orgId,
		permissions: principal.permissions,
		channel,
	};
	return {
		ctx: actionCtx,
		principal: p,
		// `trigger` is optional; defaults to `request` (the audit feed will
		// tag rows with `source = principal.channel = "mcp"` / `"rest"`).
	};
}

// ─── Internal actions ───────────────────────────────────────────────────────

/**
 * MCP dispatcher. Body is one JSON-RPC 2.0 request frame; response is one
 * JSON-RPC 2.0 response frame. The HTTP route returns the frame as the
 * response body with status 200 (transport errors live IN the frame).
 */
export const dispatchMcpRequest = internalAction({
	args: {
		body: v.any(),
		principal: principalArgs,
		scopes: v.array(v.string()),
		channel: channelValidator,
	},
	handler: async (ctx, args): Promise<McpRpcResponse> => {
		const caps: Capability[] = listCapabilities();
		const capCtx = buildCtxFromArgs(args.channel, args.principal, ctx);
		return await handleMcpRequest({
			body: args.body,
			caps,
			ctx: capCtx,
			scopes: args.scopes,
		});
	},
});

/**
 * REST dispatcher. `path` is the request URL pathname (e.g.
 * `/ai/rest/search_crm`); `body` is the parsed JSON body. Returns a
 * structured `{httpStatus, json}` so the HTTP route can set the right
 * status code without parsing the envelope.
 */
export const dispatchRestRequest = internalAction({
	args: {
		path: v.string(),
		body: v.any(),
		principal: principalArgs,
		scopes: v.array(v.string()),
		channel: channelValidator,
	},
	handler: async (ctx, args): Promise<HandleRestOutput> => {
		const caps: Capability[] = listCapabilities();
		const capCtx = buildCtxFromArgs(args.channel, args.principal, ctx);
		return await handleRestRequest({
			path: args.path,
			body: args.body,
			caps,
			ctx: capCtx,
			scopes: args.scopes,
		});
	},
});
