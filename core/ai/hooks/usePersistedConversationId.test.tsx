/**
 * core/ai/hooks/usePersistedConversationId.test.tsx
 *
 * Stage 3-A H3 — verify the chat-conversation persistence hook honours
 * its three contracts:
 *   1. SSR-safe — first render returns null even when storage has a value.
 *   2. Per-org isolation — switching orgId clears state and reads under
 *      the new org's key.
 *   3. Stale-id resilience — when `validIds` is supplied and the stored
 *      id isn't in it, the hook clears storage and returns null.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { usePersistedConversationId } from "./usePersistedConversationId";

const ORG_A = "orgA" as Id<"orgs">;
const ORG_B = "orgB" as Id<"orgs">;
const CONV_A = "convA" as Id<"aiConversations">;
const CONV_B = "convB" as Id<"aiConversations">;
const CONV_STALE = "convStale" as Id<"aiConversations">;

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	window.localStorage.clear();
	vi.restoreAllMocks();
});

describe("usePersistedConversationId", () => {
	it("starts at null when storage is empty", () => {
		const { result } = renderHook(() => usePersistedConversationId(ORG_A));
		expect(result.current[0]).toBeNull();
	});

	it("restores a stored id on mount", () => {
		window.localStorage.setItem(`flowbite:chat:${ORG_A}:activeConv`, CONV_A);
		const { result } = renderHook(() => usePersistedConversationId(ORG_A));
		// useEffect runs synchronously in renderHook after first paint.
		expect(result.current[0]).toBe(CONV_A);
	});

	it("setter writes through to storage", () => {
		const { result } = renderHook(() => usePersistedConversationId(ORG_A));
		act(() => {
			result.current[1](CONV_A);
		});
		expect(result.current[0]).toBe(CONV_A);
		expect(window.localStorage.getItem(`flowbite:chat:${ORG_A}:activeConv`)).toBe(CONV_A);
	});

	it("setter null clears storage", () => {
		window.localStorage.setItem(`flowbite:chat:${ORG_A}:activeConv`, CONV_A);
		const { result } = renderHook(() => usePersistedConversationId(ORG_A));
		act(() => {
			result.current[1](null);
		});
		expect(result.current[0]).toBeNull();
		expect(window.localStorage.getItem(`flowbite:chat:${ORG_A}:activeConv`)).toBeNull();
	});

	it("switching orgId resets state and reads new org's key", () => {
		window.localStorage.setItem(`flowbite:chat:${ORG_A}:activeConv`, CONV_A);
		window.localStorage.setItem(`flowbite:chat:${ORG_B}:activeConv`, CONV_B);
		const { result, rerender } = renderHook(({ orgId }) => usePersistedConversationId(orgId), {
			initialProps: { orgId: ORG_A as Id<"orgs"> | undefined },
		});
		expect(result.current[0]).toBe(CONV_A);
		rerender({ orgId: ORG_B });
		expect(result.current[0]).toBe(CONV_B);
	});

	it("undefined orgId returns null and never writes", () => {
		const { result } = renderHook(() => usePersistedConversationId(undefined));
		act(() => {
			result.current[1](CONV_A);
		});
		expect(result.current[0]).toBe(CONV_A); // local state still tracks
		// But nothing was persisted — there's no key to write to.
		expect(window.localStorage.length).toBe(0);
	});

	it("stale id (not in validIds) is silently cleared on mount", () => {
		window.localStorage.setItem(`flowbite:chat:${ORG_A}:activeConv`, CONV_STALE);
		const validIds = new Set<string>([CONV_A, CONV_B]);
		const { result } = renderHook(() => usePersistedConversationId(ORG_A, { validIds }));
		expect(result.current[0]).toBeNull();
		// Storage was cleared.
		expect(window.localStorage.getItem(`flowbite:chat:${ORG_A}:activeConv`)).toBeNull();
	});

	it("valid id (in validIds) is preserved on mount", () => {
		window.localStorage.setItem(`flowbite:chat:${ORG_A}:activeConv`, CONV_A);
		const validIds = new Set<string>([CONV_A, CONV_B]);
		const { result } = renderHook(() => usePersistedConversationId(ORG_A, { validIds }));
		expect(result.current[0]).toBe(CONV_A);
	});

	it("setter is stable across re-renders (safe in useEffect deps)", () => {
		const { result, rerender } = renderHook(() => usePersistedConversationId(ORG_A));
		const setter1 = result.current[1];
		rerender();
		const setter2 = result.current[1];
		expect(setter1).toBe(setter2);
	});

	it("does not throw when localStorage is unavailable (private mode)", () => {
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});
		const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError");
		});

		const { result } = renderHook(() => usePersistedConversationId(ORG_A));
		expect(result.current[0]).toBeNull(); // graceful fallback
		expect(() => {
			act(() => {
				result.current[1](CONV_A);
			});
		}).not.toThrow();

		setItemSpy.mockRestore();
		getItemSpy.mockRestore();
	});
});
