/**
 * Migration — consolidate person conversations under `entityType: "person"`
 *
 * 2026-05-19 — accompanies the conversation normalisation in
 * `convex/crm/shared/conversations/internal.ts`. Previously, the global
 * inbox + the `NewConversationDialog` created conversations with
 * `entityType: "lead"` or `"contact"` (matching the underlying record's
 * type), while the profile page Messages tab used `"person"`. Result:
 * the same person had TWO conversations and messages were split.
 *
 * What this migration does
 * ────────────────────────
 * For every `(orgId, entityId)` pair where ANY person conversation
 * exists with a non-canonical `entityType`:
 *   1. Pick the canonical conversation (existing `person`-keyed one if
 *      present, otherwise the oldest legacy one).
 *   2. Re-key the canonical to `entityType: "person"`.
 *   3. Move every message + conversationMember from sibling legacy
 *      conversations to the canonical id.
 *   4. Delete the now-empty legacy conversations.
 *
 * Same for the denormalised `messages.entityType` field (which mirrors
 * the conversation's entityType for fast cross-conversation lookup).
 *
 * Idempotent — safe to re-run. Skips orgs with no legacy data.
 *
 * How to run
 * ──────────
 *   npx convex run _migrations/consolidatePersonConversations:run '{}'
 *
 * Or scoped to one org:
 *   npx convex run _migrations/consolidatePersonConversations:run \
 *     '{ "orgId": "<convex-org-id>" }'
 */

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {
		/** Optional — restrict to a single org for staged rollout. */
		orgId: v.optional(v.id("orgs")),
	},
	handler: async (ctx, args) => {
		// Pull every legacy person-keyed conversation.
		const legacyLeadConvos = args.orgId
			? await ctx.db
					.query("conversations")
					.withIndex("by_org_and_entity", (q) =>
						q.eq("orgId", args.orgId!).eq("entityType", "lead"),
					)
					.collect()
			: await ctx.db
					.query("conversations")
					.filter((q) => q.eq(q.field("entityType"), "lead"))
					.collect();

		const legacyContactConvos = args.orgId
			? await ctx.db
					.query("conversations")
					.withIndex("by_org_and_entity", (q) =>
						q.eq("orgId", args.orgId!).eq("entityType", "contact"),
					)
					.collect()
			: await ctx.db
					.query("conversations")
					.filter((q) => q.eq(q.field("entityType"), "contact"))
					.collect();

		const legacy = [...legacyLeadConvos, ...legacyContactConvos];

		let conversationsRekeyed = 0;
		let conversationsMerged = 0;
		let messagesRekeyed = 0;
		let membersMerged = 0;

		// Group legacy conversations by (orgId, entityId, threadId) — same
		// person + same thread = same canonical target.
		const groups = new Map<string, Doc<"conversations">[]>();
		for (const c of legacy) {
			const key = `${c.orgId}:${c.entityId}:${c.threadId ?? ""}`;
			const list = groups.get(key) ?? [];
			list.push(c);
			groups.set(key, list);
		}

		for (const [, group] of groups) {
			if (group.length === 0) continue;
			const orgId = group[0]!.orgId;
			const entityId = group[0]!.entityId;
			const threadId = group[0]!.threadId;

			// Look for an existing person-keyed conversation in the same slot.
			const existingPerson = (
				await ctx.db
					.query("conversations")
					.withIndex("by_org_and_entity", (q) =>
						q.eq("orgId", orgId).eq("entityType", "person").eq("entityId", entityId),
					)
					.collect()
			).find((c) => (c.threadId ?? null) === (threadId ?? null));

			// Choose the canonical conversation:
			//   - Prefer an existing person-keyed one if present.
			//   - Otherwise pick the OLDEST legacy row (preserves earliest createdBy).
			const sortedLegacy = group.slice().sort((a, b) => a.createdAt - b.createdAt);
			const canonical = existingPerson ?? sortedLegacy[0]!;

			// Everything not the canonical → merge into canonical.
			const toMerge = sortedLegacy.filter((c) => c._id !== canonical._id);

			// 1. Re-key the canonical if it's still on a legacy entityType.
			if (canonical.entityType !== "person") {
				await ctx.db.patch(canonical._id, {
					entityType: "person",
					updatedAt: Date.now(),
				});
				conversationsRekeyed += 1;
			}

			// 2. Merge each duplicate into the canonical.
			for (const dup of toMerge) {
				// Move messages.
				const dupMessages = await ctx.db
					.query("messages")
					.withIndex("by_conversation_and_created", (q) =>
						q.eq("conversationId", dup._id),
					)
					.collect();
				for (const m of dupMessages) {
					await ctx.db.patch(m._id, {
						conversationId: canonical._id,
						entityType: "person",
						updatedAt: Date.now(),
					});
					messagesRekeyed += 1;
				}

				// Move conversationMembers — but check for duplicates against
				// the canonical first (a user might already be a member of both).
				const dupMembers = await ctx.db
					.query("conversationMembers")
					.withIndex("by_conversation", (q) => q.eq("conversationId", dup._id))
					.collect();
				for (const dm of dupMembers) {
					const existingOnCanonical = await ctx.db
						.query("conversationMembers")
						.withIndex("by_user_and_conversation", (q) =>
							q.eq("userId", dm.userId).eq("conversationId", canonical._id),
						)
						.first();
					if (existingOnCanonical) {
						// Already a member of canonical — fold lastReadAt forward
						// (take the LATER of the two so we don't accidentally
						// re-mark messages as unread).
						const existingLast = existingOnCanonical.lastReadAt ?? 0;
						const dupLast = dm.lastReadAt ?? 0;
						if (dupLast > existingLast) {
							await ctx.db.patch(existingOnCanonical._id, {
								lastReadAt: dupLast,
							});
						}
						// Drop the duplicate row.
						await ctx.db.delete(dm._id);
					} else {
						// Re-key the row to the canonical conversation.
						await ctx.db.patch(dm._id, {
							conversationId: canonical._id,
						});
						membersMerged += 1;
					}
				}

				// 3. Drop the empty legacy conversation.
				await ctx.db.delete(dup._id);
				conversationsMerged += 1;
			}

			// 4. Forward `lastMessageAt` / `lastMessagePreview` if the merge
			//    produced a newer "last message" than the canonical knew about.
			const newest = await ctx.db
				.query("messages")
				.withIndex("by_conversation_and_created", (q) =>
					q.eq("conversationId", canonical._id),
				)
				.order("desc")
				.first();
			if (newest) {
				const canonicalLast = canonical.lastMessageAt ?? 0;
				if (newest.createdAt > canonicalLast) {
					await ctx.db.patch(canonical._id, {
						lastMessageAt: newest.createdAt,
						lastMessagePreview: newest.content.slice(0, 200),
						lastMessageAuthorId: newest.authorId,
						updatedAt: Date.now(),
					});
				}
			}
		}

		// Also rekey any orphan messages that have non-canonical entityType
		// even though their conversation is already on `person` (defensive —
		// catches cases where a conversation was rekeyed manually but
		// messages weren't).
		const orphanLeadMessages = args.orgId
			? await ctx.db
					.query("messages")
					.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId!))
					.collect()
					.then((rows) =>
						rows.filter((m) => m.entityType === "lead" || m.entityType === "contact"),
					)
			: await ctx.db
					.query("messages")
					.filter((q) =>
						q.or(
							q.eq(q.field("entityType"), "lead"),
							q.eq(q.field("entityType"), "contact"),
						),
					)
					.collect();
		for (const m of orphanLeadMessages) {
			await ctx.db.patch(m._id, { entityType: "person", updatedAt: Date.now() });
			messagesRekeyed += 1;
		}

		return {
			scope: args.orgId ? `org:${args.orgId}` : "all-orgs",
			groupsScanned: groups.size,
			conversationsRekeyed,
			conversationsMerged,
			messagesRekeyed,
			membersMerged,
		};
	},
});
