/**
 * Default WhatsApp template set — S14 (Outbound send).
 *
 * Pure config; consumed by `send_whatsapp` capability when the 24h
 * customer-service window is closed (Twilio rejects free-form session
 * messages outside that window — only pre-approved templates land).
 *
 * Each template carries:
 *   - `id`           — stable key the AI references in args (e.g. `"greeting_v1"`).
 *   - `category`     — Twilio Content API category (`utility` / `marketing` /
 *                      `authentication`). Today every shipped template is
 *                      `utility` (transactional), which is what the audit /
 *                      compliance fence expects.
 *   - `body`         — plain text WITH `{{var}}` placeholders.
 *   - `variables`    — declared placeholders + descriptions (so the AI
 *                      knows what to fill before calling `send_whatsapp`).
 *   - `contentSid`   — optional. When set, the outbound action prefers the
 *                      Twilio Content API path (uses `ContentSid` +
 *                      `ContentVariables`) — required for real out-of-window
 *                      sends. Unset means "render locally + best-effort send";
 *                      that path lives behind `TWILIO_MOCK_MODE` for tests
 *                      until each template is approved + assigned a SID.
 *
 * Locked decision: this file is the v1 SSOT. A `WhatsApp templates admin
 * UI` is tracked under `Future-Enhancements.md §B.40` — once it lands,
 * the template set will move to a per-org `whatsappTemplates` table and
 * this constant becomes a seed-only fallback.
 */

export type WhatsappTemplateCategory = "utility" | "marketing" | "authentication";

export type WhatsappTemplateVariable = {
	/** Placeholder key inside the body (e.g. `name` for `{{name}}`). */
	name: string;
	/** Hint for the AI: "the agent's name", "the appointment time in org tz", … */
	description: string;
	/** Optional fallback when the AI doesn't provide a value (rare). */
	defaultValue?: string;
};

export type WhatsappTemplate = {
	id: string;
	label: string;
	description: string;
	category: WhatsappTemplateCategory;
	body: string;
	variables: WhatsappTemplateVariable[];
	contentSid?: string;
};

// ─── Default template set (4 templates, all `utility`) ─────────────────────

export const DEFAULT_WHATSAPP_TEMPLATES: ReadonlyArray<WhatsappTemplate> = [
	{
		id: "greeting_v1",
		label: "Greeting",
		description: "First reach-out after a lead lands. Use within minutes of capture.",
		category: "utility",
		body: "Hi {{name}}, this is {{agent_name}} from {{org_name}}. Thanks for reaching out — happy to help. When's a good time to talk?",
		variables: [
			{ name: "name", description: "The lead's first name." },
			{ name: "agent_name", description: "The agent's display name." },
			{ name: "org_name", description: "The workspace name." },
		],
	},
	{
		id: "follow_up_v1",
		label: "Follow up",
		description: "Light-touch nudge when a lead has gone quiet for 2+ days.",
		category: "utility",
		body: "Hi {{name}}, just checking back on {{topic}}. Let me know if you'd like me to send anything across — happy to help.",
		variables: [
			{ name: "name", description: "The lead's first name." },
			{
				name: "topic",
				description: "What the previous conversation was about (1-3 words).",
			},
		],
	},
	{
		id: "appointment_v1",
		label: "Appointment confirmation",
		description: "Confirms a booked viewing / call / meeting.",
		category: "utility",
		body: "Hi {{name}}, confirming your {{event}} on {{date}} at {{time}}. Reply YES to confirm or message me if you need to reschedule.",
		variables: [
			{ name: "name", description: "The lead's first name." },
			{ name: "event", description: "The appointment kind (call / viewing / meeting)." },
			{ name: "date", description: "Date in the org's timezone (e.g. 'Tue 11 Jun')." },
			{ name: "time", description: "Time in the org's timezone (e.g. '3:00 PM')." },
		],
	},
	{
		id: "agent_handoff_v1",
		label: "Agent will reach out",
		description:
			"Acknowledges the customer when an agent isn't available; sets the expectation a human will pick up the thread.",
		category: "utility",
		body: "Hi {{name}}, thanks for your message. One of our agents will reach out shortly. If it's urgent, please reply with the word URGENT.",
		variables: [{ name: "name", description: "The lead's first name." }],
	},
];

// ─── Lookup helpers (pure) ─────────────────────────────────────────────────

/** Build an indexed map for O(1) lookups by id. Pure — exported for tests. */
export function buildTemplateIndex(
	templates: ReadonlyArray<WhatsappTemplate> = DEFAULT_WHATSAPP_TEMPLATES,
): Map<string, WhatsappTemplate> {
	const map = new Map<string, WhatsappTemplate>();
	for (const t of templates) map.set(t.id, t);
	return map;
}

/** Look up a template by id. Returns undefined when missing. */
export function findTemplate(
	id: string,
	templates: ReadonlyArray<WhatsappTemplate> = DEFAULT_WHATSAPP_TEMPLATES,
): WhatsappTemplate | undefined {
	return templates.find((t) => t.id === id);
}

/** List ids — used by error messages + capability discoverability. */
export function listTemplateIds(
	templates: ReadonlyArray<WhatsappTemplate> = DEFAULT_WHATSAPP_TEMPLATES,
): string[] {
	return templates.map((t) => t.id);
}

// ─── Render helpers (pure) ─────────────────────────────────────────────────

/**
 * Render a template body by substituting `{{var}}` placeholders. Returns
 * a discriminated result so the capability can surface a clean repair
 * envelope when a required variable is missing instead of sending a
 * "Hi {{name}}, …" body to the customer.
 */
export type TemplateRenderResult = { ok: true; body: string } | { ok: false; missing: string[] };

export function renderTemplateBody(
	template: WhatsappTemplate,
	vars: Record<string, string> | undefined,
): TemplateRenderResult {
	const supplied = vars ?? {};
	const missing: string[] = [];
	let body = template.body;

	for (const v of template.variables) {
		const provided = supplied[v.name];
		if (provided !== undefined && provided.trim().length > 0) {
			// Replace ALL occurrences of the placeholder, not just the first —
			// `{{name}}` may appear multiple times in a template.
			body = body.split(`{{${v.name}}}`).join(provided);
			continue;
		}
		if (typeof v.defaultValue === "string") {
			body = body.split(`{{${v.name}}}`).join(v.defaultValue);
			continue;
		}
		missing.push(v.name);
	}

	if (missing.length > 0) return { ok: false, missing };
	return { ok: true, body };
}

// ─── 24-hour customer-service window helper (pure) ─────────────────────────

/**
 * Twilio's WhatsApp Business policy permits free-form session messages
 * within 24h of the LAST inbound from the customer. After that, only
 * pre-approved templates are allowed. Pure — exported for tests.
 */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinSessionWindow(
	lastInboundAt: number | undefined | null,
	now: number = Date.now(),
): boolean {
	if (typeof lastInboundAt !== "number") return false;
	return now - lastInboundAt < SESSION_WINDOW_MS;
}
