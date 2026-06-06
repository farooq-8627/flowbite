/**
 * Envelope builders. `run()` MUST return one of these — the type forbids a
 * bare string, which is how the legacy layer ended up replying "Done.".
 */
import type { CapabilityResult, Outcome } from "./types";

/** Fields a builder accepts (everything on the envelope except `status`). */
type ResultBody = Omit<CapabilityResult, "status">;

/** Success. */
export function ok(body: ResultBody): CapabilityResult {
	return { status: "ok", ...body };
}

/** Some rows succeeded, some failed — pass per-row `errors`. */
export function partial(body: ResultBody): CapabilityResult {
	return { status: "partial", ...body };
}

/** A terminal failure with an explicit outcome + optional per-row errors. */
export function failed(
	status: Outcome,
	headline: string,
	errors?: { item: string; reason: string }[],
): CapabilityResult {
	return { status, headline, ...(errors ? { errors } : {}) };
}

/**
 * Self-correction envelope. The model reads `repair` and retries with a fixed
 * argument (bounded by the host's retry budget). `example` shows the right shape.
 */
export function repair(
	field: string,
	expected: string,
	received: string,
	fix: string,
	example: object,
): CapabilityResult {
	return {
		status: "needs_repair",
		headline: `The "${field}" value needs fixing — expected ${expected}.`,
		repair: { field, expected, received, fix, example },
	};
}

/** Ask the user to disambiguate; `options` become clickable follow-ups. */
export function ask(question: string, options?: string[]): CapabilityResult {
	return {
		status: "ambiguous",
		headline: question,
		...(options && options.length > 0
			? { suggestedNext: options.map((o) => ({ label: o, intent: o })) }
			: {}),
	};
}

/** RBAC refusal naming the missing permission. */
export function denied(permission: string): CapabilityResult {
	return {
		status: "denied",
		headline: `You don't have permission to do that (requires: ${permission}).`,
	};
}
