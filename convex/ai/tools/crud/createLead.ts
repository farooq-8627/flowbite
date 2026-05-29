/**
 * convex/ai/tools/crud/createLead.ts
 *
 * Two-step lead creation:
 *   - `create_lead` proposes the write (rendered in chat as an EntityPreviewCard)
 *   - `commit_create_lead` runs the actual mutation after approval
 *
 * Schema design:
 *   - `displayName` is required; everything else is optional.
 *   - Optional fields use `optionalString()` which coerces null/""/whitespace
 *     to `undefined` BEFORE the inner validator runs — this stops LLMs that
 *     emit `null` for "no value" from triggering Zod retry loops.
 *   - **`customFields` accepts org-defined fields** (company_size,
 *     industry_vertical, lead_source_detail, …). Applied AFTER the row
 *     creation via `applyCustomFieldsForRecord`. Without this path the AI
 *     had no way to set custom fields at create-time — see the 2026-05-24
 *     incident under PHASE-3-AI-AUDIT.md §6.5 incident-class B.
 *   - The model is told (via the description) to call `ask_user_input` when
 *     it needs more data, and to NEVER pass null to optional fields.
 *
 * Permission: `leads.create`. Confirmation: twoStep.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "twoStep",
	approvalCategory: "create_record",
	// P1.4 — structured instruction. The model-facing `description` is
	// auto-built from this; see toolRegistry.ts::buildToolDescription.
	// Free-form `description` is kept as the safety fallback in case
	// `instruction` is dropped during a refactor.
	description: "Create a new lead (prospective customer). Run search_crm first.",
	instruction: {
		whenToCall:
			"Use when the user asks to add a new sales prospect / lead / potential customer. Shows a preview card and waits for user approval before writing.",
		whenNotToCall:
			"the user already has the person in the CRM (call update_entity to edit them) OR wants to convert an existing lead to a contact (call convert_lead).",
		preflight: ["search_crm"],
		requiredClarifications: ["displayName"],
		synonyms: ["prospect", "potential customer", "new contact lead"],
		goodExample: {
			description:
				"User: 'Add Sarah Khan, a SaaS lead at 51-200 employees, sarah@example.com.'",
			args: {
				displayName: "Sarah Khan",
				email: "sarah@example.com",
				source: "manual",
				customFields: {
					industry_vertical: "SaaS",
					company_size: "51-200",
				},
			},
		},
		badExample: {
			description: "User: 'Add a lead.'",
			args: { displayName: "" },
			whyBad: "displayName is required. Call ask_user_input first to collect the name (and optionally email/phone).",
		},
	},
	runbook: {
		// Day 2 T1.5 (`PHASE-3-AI-AUDIT.md §6.5 E.T1.5`) — pre-flight on every
		// create_*. Putting it on `onSuccess` (the first line the model reads
		// in the runbook block) means even a small model sees it before
		// producing the tool call.
		//
		// P1.9 update: the commit now returns a rich `summary` envelope
		// (headline + table + suggested-next chips). Your prose reply
		// can be ONE concise sentence — the structured card already shows
		// the fields and offers next-step chips. Don't restate the table.
		onSuccess:
			"PRE-FLIGHT FIRST: ALWAYS call `search_crm` with the lead's name + email/phone before this tool to detect duplicates. If a match is found, do NOT create — show the existing record and ask the user whether to update it instead. After success: write ONE concise sentence ('Sarah Khan is now in your CRM as L-014') — the structured summary card auto-renders the field table + suggested follow-ups. If `unknownCustomFields` is non-empty, mention them so the user can fix the slug.",
		onValidationError:
			"Group failed fields and call ask_user_input ONCE for ALL of them. Never retry with the same args.",
		onPermissionDenied:
			"Tell the user they need leads.create permission. Suggest contacting an admin.",
		suggestNext: "create_task",
	},
	schema: z.object({
		displayName: z.string().min(1).describe("Full name of the lead. Required."),
		email: optionalString(z.string().email()),
		phone: optionalString(),
		source: z.string().default("manual").describe("Lead source: manual, referral, web, etc."),
		assignedTo: optionalString().describe("userId to assign this lead to."),
		notes: optionalString().describe("Initial note to attach."),
		customFields: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Org-defined custom fields keyed by field name. Values are forwarded as-is."),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "leads.create");
		return propose("create_lead", args, {
			title: `Create lead: ${args.displayName}`,
			fields: [
				{ label: "Name", value: args.displayName },
				{ label: "Email", value: args.email ?? "—" },
				{ label: "Phone", value: args.phone ?? "—" },
				{ label: "Source", value: args.source },
				{ label: "Notes", value: args.notes ?? "—" },
				...(args.customFields
					? Object.entries(args.customFields).map(([k, v]) => ({
							label: k,
							value: v == null ? "—" : String(v),
						}))
					: []),
			],
		});
	},
});

registerTool({
	name: "commit_create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved lead creation. Do not call without prior create_lead approval.",
	schema: z.object({
		displayName: z.string(),
		email: optionalString(),
		phone: optionalString(),
		source: z.string().default("manual"),
		assignedTo: optionalString(),
		// `notes` is forwarded from the propose schema — the commit MUST
		// declare it here so the zod-strip in `resume.ts` doesn't drop it
		// before we get a chance to chain the add_note call.
		notes: optionalString(),
		customFields: z.record(z.string(), z.unknown()).optional(),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCrudCtx();
			requirePermission(permissions, "leads.create");

			// 1) Create the lead. NEVER forward `notes` / `customFields` to
			//    the underlying mutation — its validator doesn't accept
			//    them (see the 2026-05-24 incident in `friendlyToolError.ts`).
			const { notes, customFields, ...leadArgs } = args;
			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/leads/mutations:create",
				{ orgId, ...leadArgs },
			)) as { leadId: string; personCode: string };

			// 2) Apply org-defined custom fields. Best-effort: failure here
			//    leaves the lead saved and surfaces the unknown / failed
			//    keys so the agent can mention them.
			let appliedCustomFields: string[] = [];
			let unknownCustomFields: string[] = [];
			if (customFields && Object.keys(customFields).length > 0) {
				try {
					const cfResult = (await ctx.runMutation(
						internal.ai.aiEntityPatch.applyCustomFieldsForRecord,
						{
							orgId,
							userId,
							entityType: "lead",
							entityId: result.leadId,
							customFields,
						},
					)) as {
						applied: Array<{ name: string; value: unknown }>;
						unknown: string[];
					};
					appliedCustomFields = cfResult.applied.map((f) => f.name);
					unknownCustomFields = cfResult.unknown;
				} catch (err) {
					console.warn(
						"[commit_create_lead] lead saved but custom-field apply failed:",
						err,
					);
				}
			}

			// 3) If the user attached a note in the propose, persist it
			//    via `notes:create`. Failure here is non-fatal — the lead
			//    is already saved; we just log the failure so the agent
			//    can mention the partial success.
			if (notes && notes.trim().length > 0) {
				try {
					// notes:create validator: `entityId` is required (the row's
					// document _id), `personCode` is the optional human-readable
					// secondary key. Bug 2026-05-24: this previously passed
					// `entityCode: personCode` which the validator silently
					// rejected as "missing entityId" because `entityCode` is not
					// even a known field. Now we pass both correctly.
					await toolMutation(getCrudCtx(), "crm/shared/notes/mutations:create", {
						orgId,
						entityType: "lead",
						entityId: result.leadId,
						personCode: result.personCode,
						content: notes.trim(),
						isInternal: false,
						authorType: "ai",
					});
				} catch (err) {
					console.warn("[commit_create_lead] lead saved but note attach failed:", err);
				}
			}

			// 4) Build a rich ToolSummary so the chat shows a structured
			//    headline + table + suggested-next chips ABOVE the live
			//    entity card. Without this, the user sees only "✓" + a
			//    near-empty card (the default 5 fields hide custom values).
			//    See P1.9 (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`).
			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Name", value: leadArgs.displayName },
			];
			if (leadArgs.email) summaryRows.push({ label: "Email", value: leadArgs.email });
			if (leadArgs.phone) summaryRows.push({ label: "Phone", value: leadArgs.phone });
			if (leadArgs.source && leadArgs.source !== "manual") {
				summaryRows.push({ label: "Source", value: leadArgs.source });
			}
			// Append every successfully-applied custom field as a row so
			// the user can verify the values landed.
			if (customFields && appliedCustomFields.length > 0) {
				for (const k of appliedCustomFields) {
					const v = (customFields as Record<string, unknown>)[k];
					summaryRows.push({
						label: k,
						value: v == null ? "—" : String(v),
					});
				}
			}

			const facts: string[] = [];
			if (notes && notes.trim().length > 0) {
				facts.push("Initial note attached.");
			}
			if (unknownCustomFields.length > 0) {
				facts.push(
					`These keys aren't custom fields on this org: ${unknownCustomFields.join(", ")}. Create them via \`create_field\` first if you'd like to capture them.`,
				);
			}

			// Emit cardFields so the live EntityCard shows every field
			// that was just set, not the default 5.
			const cardFields = [
				"displayName",
				"email",
				"phone",
				"personCode",
				"status",
				"source",
				"assignedTo",
				...appliedCustomFields,
				"tags",
			];

			return {
				ok: true as const,
				data: { ...result, appliedCustomFields, unknownCustomFields },
				display: {
					kind: "entity" as const,
					entityType: "lead" as const,
					entityId: result.leadId,
				},
				summary: {
					headline: `Created lead ${result.personCode}: ${leadArgs.displayName}`,
					table: summaryRows,
					facts: facts.length > 0 ? facts : undefined,
					suggestedNext: [
						{
							label: "Add follow-up",
							intent: `Schedule a follow-up call with ${result.personCode} for next week`,
						},
						{
							label: "Log call note",
							intent: `Add a note to ${result.personCode} summarising our conversation`,
						},
						{
							label: "Convert to contact",
							intent: `Convert lead ${result.personCode} to a contact`,
						},
					],
					cardFields,
				},
			};
		});
	},
});
