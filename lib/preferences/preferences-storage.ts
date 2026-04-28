/**
 * Cookie-based preference storage helpers.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * All preferences use cookies so the server can read them during SSR
 * and apply layout-critical values before hydration (no FOUC).
 */

import {
	COOKIE_MAX_AGE,
	COOKIE_PREFIX,
	PREFERENCE_DEFAULTS,
	type PreferenceKey,
	type PreferenceTypeMap,
} from "./preferences-config";

/**
 * Read a single preference from cookies (server-side).
 * Falls back to the default value if not found.
 *
 * @param key - The preference key to read
 * @param validValues - Array of valid values for validation
 * @param defaultValue - Fallback value if not found or invalid
 */
export async function getPreference<K extends PreferenceKey, T extends string>(
	key: K,
	validValues: readonly T[],
	defaultValue: T,
): Promise<T> {
	const { cookies } = await import("next/headers");
	const cookieStore = await cookies();
	const cookieName = `${COOKIE_PREFIX}${key}`;
	const cookie = cookieStore.get(cookieName);

	if (!cookie?.value) {
		return defaultValue;
	}

	const value = decodeURIComponent(cookie.value);

	// Validate the value is in the allowed set
	if (validValues.includes(value as T)) {
		return value as T;
	}

	return defaultValue;
}

/**
 * Read a single preference from cookies (client-side).
 * Falls back to the default value if not found.
 */
export function getPreferenceClient<K extends PreferenceKey>(key: K): PreferenceTypeMap[K] {
	if (typeof document === "undefined") {
		return PREFERENCE_DEFAULTS[key];
	}

	const cookieName = `${COOKIE_PREFIX}${key}`;
	const cookies = document.cookie.split("; ");
	const cookie = cookies.find((c) => c.startsWith(`${cookieName}=`));

	if (!cookie) {
		return PREFERENCE_DEFAULTS[key];
	}

	const value = decodeURIComponent(cookie.split("=")[1] ?? "");
	return (value || PREFERENCE_DEFAULTS[key]) as PreferenceTypeMap[K];
}

/**
 * Write a single preference to a cookie (client-side).
 * Sets path=/ and SameSite=Lax for broad access.
 * Alias for setPreference for consistency with naming.
 */
export function persistPreference<K extends PreferenceKey>(
	key: K,
	value: PreferenceTypeMap[K],
): void {
	setPreference(key, value);
}

/**
 * Write a single preference to a cookie (client-side).
 * Sets path=/ and SameSite=Lax for broad access.
 */
export function setPreference<K extends PreferenceKey>(key: K, value: PreferenceTypeMap[K]): void {
	if (typeof document === "undefined") return;

	const cookieName = `${COOKIE_PREFIX}${key}`;
	const encodedValue = encodeURIComponent(String(value));
	document.cookie = `${cookieName}=${encodedValue}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Read all preferences from cookies (client-side).
 * Returns a complete PreferenceTypeMap with defaults for missing values.
 */
export function getAllPreferences(): PreferenceTypeMap {
	return {
		sidebar_variant: getPreferenceClient("sidebar_variant"),
		sidebar_collapsible: getPreferenceClient("sidebar_collapsible"),
		content_layout: getPreferenceClient("content_layout"),
		navbar_style: getPreferenceClient("navbar_style"),
		theme_preset: getPreferenceClient("theme_preset"),
		theme_mode: getPreferenceClient("theme_mode"),
		radius: getPreferenceClient("radius"),
		font: getPreferenceClient("font"),
	};
}

/**
 * Parse preferences from a server-side cookie header string.
 * Used in Next.js server components / middleware to read layout prefs.
 */
export function parsePreferencesFromCookieHeader(cookieHeader: string): PreferenceTypeMap {
	const result = { ...PREFERENCE_DEFAULTS };
	const cookies = cookieHeader.split("; ");

	for (const key of Object.keys(PREFERENCE_DEFAULTS) as PreferenceKey[]) {
		const cookieName = `${COOKIE_PREFIX}${key}`;
		const cookie = cookies.find((c) => c.startsWith(`${cookieName}=`));
		if (cookie) {
			const value = decodeURIComponent(cookie.split("=")[1] ?? "");
			if (value) {
				// biome-ignore lint: dynamic assignment from cookie parsing
				(result as Record<string, string>)[key] = value;
			}
		}
	}

	return result as PreferenceTypeMap;
}
