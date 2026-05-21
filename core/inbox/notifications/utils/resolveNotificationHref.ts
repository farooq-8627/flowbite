"use client";

/**
 * Notification href resolver — client-side, labels-aware.
 *
 * The server stores `(entityType, entityId)` on every notification. The
 * server does NOT know the org's renamed entity slugs (it would have to
 * fetch the org doc on every notification render — expensive + racy with
 * label changes). So the client computes the actual URL on render via
 * `useEntityLabels()`.
 *
 * Routing rules:
 *   - person / lead / contact   → /{orgSlug}/profile/{entityId}?group=messages
 *   - person — type=mention     → /{orgSlug}/profile/{entityId}?group=notes
 *   - deal                      → /{orgSlug}/profile/{personCode}?group=deals
 *                                 (deals don't own a detail route — they
 *                                 redirect to the owning person's profile)
 *   - company                   → /{orgSlug}/{labels.company.slug}/{entityId}
 *   - user                      → /{orgSlug}/messages
 *   - anything else             → fallback to the legacy `actionUrl` if
 *                                 the server provided one, else `null`.
 *
 * NOTE: For deals we don't have the personCode in the notification doc,
 * so we just route to the dynamic `{labels.deal.slug}/{dealCode}` URL —
 * the `EntityDetailRedirect` page resolves it client-side and forwards
 * to the right profile.
 */

import type { EntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";

export interface NotificationHrefArgs {
	orgSlug: string;
	labels: EntityLabels;
	entityType: string | undefined;
	entityId: string | undefined;
	/**
	 * Type tag from the notification — used to choose the right group on
	 * the profile page (e.g. "mention" → notes, otherwise messages).
	 */
	notificationType?: string;
	/**
	 * Legacy actionUrl from the server. Used as a fallback when we can't
	 * derive a path from `entityType + entityId`. Existing notifications
	 * inserted before this client-side resolver landed will still route
	 * through their stored URL.
	 */
	legacyActionUrl?: string;
}

/**
 * Returns the absolute path the notification should route to, or `null`
 * if no destination can be determined.
 */
export function resolveNotificationHref({
	orgSlug,
	labels,
	entityType,
	entityId,
	notificationType,
	legacyActionUrl,
}: NotificationHrefArgs): string | null {
	const prefix = `/${orgSlug}`;

	if (entityType && entityId) {
		switch (entityType) {
			case "person":
			case "lead":
			case "contact": {
				const group = notificationType?.includes("mention") ? "notes" : "messages";
				return `${prefix}/profile/${entityId}?group=${group}`;
			}
			case "deal":
				// Deal notifications: route to the dynamic deal slug. The
				// dynamic route's redirect resolves dealCode → personCode →
				// /profile/<personCode>?group=deals.
				return `${prefix}/${labels.deal.slug}/${entityId}`;
			case "company":
				return `${prefix}/${labels.company.slug}/${entityId}`;
			case "user":
				return `${prefix}/messages`;
		}
	}

	// Fallback — old notifications with a stored actionUrl. Strip a
	// leading slash if present and re-prefix with the orgSlug. This keeps
	// historic notifications (created before the dynamic-slug fix) routing
	// to a sensible place even if the URL it stored is the default slug.
	if (legacyActionUrl) {
		const trimmed = legacyActionUrl.startsWith("/") ? legacyActionUrl : `/${legacyActionUrl}`;
		return `${prefix}${trimmed}`;
	}

	return null;
}
