"use client";

/**
 * PostHogOwnerPanelGuard — client-side `before_send` registration.
 *
 * WHY THIS FILE EXISTS:
 *   Our outer `PostHogProvider` is a React Server Component (RSC) because
 *   `@posthog/next`'s `PostHogProvider` is exported only from the server
 *   bundle (react-server condition). RSCs cannot pass functions across the
 *   server→client boundary, so we cannot inline `before_send` into
 *   `clientOptions` from the server wrapper without triggering:
 *
 *     "Functions cannot be passed directly to Client Components unless you
 *      explicitly expose it by marking it with 'use server'..."
 *
 *   Instead we mount this tiny client component as a child of the provider
 *   and call `posthog.set_config({ before_send })` after the SDK is alive.
 *   `posthog-js` v1.x supports `set_config` (see
 *   node_modules/posthog-js/dist/module.full.no-external.d.ts:4222).
 *
 * OWNER-PANEL EXCLUSION (Stage 3 — 2026-05-27):
 *   Drops every event captured while the user is inside the owner panel.
 *   Detection uses the non-secret `is_owner_panel=1` cookie set by middleware
 *   (PLATFORM-OWNER-PANEL.md §9 — keeps the public slug out of the JS
 *   bundle, locked decision §9.3).
 *
 * Sources:
 * - node_modules/@posthog/next/dist/app/PostHogProvider.js — RSC wrapper that
 *   forwards `clientOptions` (including non-serialisable functions) to
 *   ClientPostHogProvider, which is the surface that throws on functions.
 * - node_modules/posthog-js/dist/module.full.no-external.d.ts:4222 —
 *   `set_config(config: Partial<PostHogConfig>): void` API.
 * - PLATFORM-OWNER-PANEL.md §9 — telemetry exclusion contract.
 */

import { usePostHog } from "@posthog/next";
import { useEffect } from "react";

const OWNER_PANEL_COOKIE = "is_owner_panel";

function isOwnerPanelClient(): boolean {
	if (typeof document === "undefined") return false;
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${OWNER_PANEL_COOKIE}=([^;]+)`));
	return match?.[1] === "1";
}

/**
 * Renders nothing. Registers a `before_send` callback on the live posthog-js
 * instance after init so events captured inside the owner panel are dropped.
 *
 * Idempotent — guarded by `posthog.config.before_send` identity so React
 * StrictMode / double-mount doesn't stack callbacks.
 */
export function PostHogOwnerPanelGuard(): null {
	const posthog = usePostHog();

	useEffect(() => {
		if (!posthog) return;

		// biome-ignore lint/suspicious/noExplicitAny: posthog-js typings don't expose `config` on the instance type, but it's a documented public field used since v1.0.
		const cfg = (posthog as any).config;
		if (cfg?.before_send === beforeSendOwnerPanelGuard) return;

		posthog.set_config({ before_send: beforeSendOwnerPanelGuard });
	}, [posthog]);

	return null;
}

// Module-scope reference so the identity check inside the effect works across
// re-renders. Returning `null` from before_send drops the event.
function beforeSendOwnerPanelGuard<T>(event: T): T | null {
	if (isOwnerPanelClient()) return null;
	return event;
}
