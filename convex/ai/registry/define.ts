/**
 * Capability registry. Each per-module `capabilities.ts` calls
 * `defineCapability` at import time. Duplicate names throw at import to
 * fail loud on collisions instead of silently shadowing.
 */
import type { Capability, CapabilityDef } from "./types";

/** Every defined capability, keyed by its stable `name`. */
export const REGISTRY = new Map<string, Capability>();

/**
 * Register a capability and return it. Throws on a duplicate name so a
 * collision fails loudly at import time rather than silently shadowing.
 */
export function defineCapability<TArgs>(def: CapabilityDef<TArgs>): Capability {
	if (REGISTRY.has(def.name)) {
		throw new Error(`[ai/registry] Duplicate capability name: "${def.name}".`);
	}
	// Safe widen: the wrapper always parses raw args through `def.input` before
	// calling `run`, so the runtime value matches `TArgs`.
	const capability = def as unknown as Capability;
	REGISTRY.set(capability.name, capability);
	return capability;
}

/** Look up a capability by name. */
export function getCapability(name: string): Capability | undefined {
	return REGISTRY.get(name);
}

/** All registered capabilities, in insertion order. */
export function listCapabilities(): Capability[] {
	return Array.from(REGISTRY.values());
}
