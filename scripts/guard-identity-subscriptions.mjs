#!/usr/bin/env node
/**
 * Lint guard: enforces the locked rule
 *
 *   "Identity/auth/labels/feature-flags via context, not subscriptions"
 *   (AGENTS.md, locked 2026-05-18)
 *
 * Session-scoped Convex queries that are already hoisted into
 * `<OrgProvider>` MUST NOT be called via `useQuery(...)` directly anywhere
 * else in the dashboard tree. This script walks the codebase, allow-lists
 * the files that *are* allowed to call them (the provider itself plus the
 * pre-shell entry points), and exits non-zero on any other match.
 *
 * Pure Node: no rg / grep / external tools required, so it runs in any CI
 * runner without extra setup.
 *
 * Run:
 *   pnpm guard:identity-subscriptions
 *
 * To add a new banned subscription:
 *   1. Subscribe to it inside `core/shell/shared/hooks/useCurrentOrg.tsx`.
 *   2. Expose it via a new context hook.
 *   3. Add the API path to BANNED below and a comment explaining why.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

/**
 * Banned `useQuery` targets — anything subscribed to from `<OrgProvider>`.
 */
const BANNED = [
	{
		api: "api.orgs.queries.listMyOrgs",
		reason: "Hoisted to OrgProvider; read via useCurrentOrg().allOrgs.",
	},
	{
		api: "api.orgs.queries.getMyMembership",
		reason: "Hoisted to OrgProvider; read via useCurrentOrg().membership.",
	},
	{
		api: "api.orgs.queries.listMembers",
		reason: "Hoisted to OrgProvider; read via useOrgMembers().",
	},
	{
		api: "api.orgs.queries.getEntityLabels",
		reason: "Hoisted to OrgProvider; read via useEntityLabels().",
	},
	{
		api: "api.users.queries.me",
		reason: "Hoisted to OrgProvider; read via useMe().",
	},
	{
		api: "api.orgRoles.queries.getMyPermissions",
		reason: "Permissions are already resolved on getMyMembership; read via useOrgPermissions(). Never call this from the client.",
	},
	{
		api: "api.featureFlags.queries.getForOrg",
		reason: "Hoisted to OrgProvider; read via useFeatureFlags() or useModuleEnabled(key).",
	},
	{
		api: "api.crm.shared.tags.queries.listByOrg",
		reason: "Hoisted to CrmDataProvider; read via useOrgTags(orgId) — reference-counted so unopened popovers pay nothing.",
	},
];

/**
 * Files allowed to call the banned APIs. These are the provider itself
 * plus the entry-point files that run BEFORE OrgProvider mounts (root
 * redirect, onboarding pre-check) and the legacy fallback hooks that
 * also work outside the shell.
 */
const ALLOWED_FILES = new Set(
	[
		"core/shell/shared/hooks/useCurrentOrg.tsx",
		"core/shell/shared/hooks/useEntityLabels.ts",
		"core/shell/shared/hooks/useOrgDefaultCurrency.ts",
		"core/shell/shell/hooks/useModuleEnabled.ts",
		"core/shell/shell/components/OnboardingGuard.tsx",
		"core/entities/shared/hooks/useOrgTags.tsx",
		"app/[locale]/page.tsx",
	].map((p) => p.replace(/\\/g, "/")),
);

/** Directories to scan. */
const SCAN_DIRS = ["app", "components", "core", "features", "hooks", "lib", "stores"];

/** Directories to skip even if they appear inside a SCAN_DIR. */
const SKIP_DIR_NAMES = new Set([
	"node_modules",
	".next",
	".turbo",
	".trigger",
	".firecrawl",
	".playwright-mcp",
	".code-review-graph",
	"dist",
	"build",
	"out",
	"_generated",
]);

/** Skip non-source files inside scanned dirs. */
function isSourceFile(name) {
	return /\.(tsx?|jsx?|mjs|cjs)$/.test(name);
}

/** Skip test files — they may legitimately exercise the banned queries. */
function isTestFile(path) {
	return /(\.test\.|\.spec\.|__tests__\/)/.test(path);
}

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (SKIP_DIR_NAMES.has(e.name)) continue;
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			yield* walk(full);
		} else if (e.isFile() && isSourceFile(e.name)) {
			yield full;
		}
	}
}

const violations = [];

// Pre-build matchers — `useQuery(api.<path>` allowing whitespace + line
// breaks between `(` and `api`.
const matchers = BANNED.map(({ api, reason }) => ({
	api,
	reason,
	regex: new RegExp(`useQuery\\s*\\(\\s*${api.replace(/\./g, "\\.")}(?![A-Za-z0-9_])`, "g"),
}));

for (const baseDir of SCAN_DIRS) {
	const abs = join(ROOT, baseDir);
	try {
		statSync(abs);
	} catch {
		continue;
	}
	for (const file of walk(abs)) {
		const rel = relative(ROOT, file).replace(/\\/g, "/");
		if (ALLOWED_FILES.has(rel)) continue;
		if (isTestFile(rel)) continue;

		const src = readFileSync(file, "utf8");
		const lines = src.split("\n");
		for (const { api, reason, regex } of matchers) {
			regex.lastIndex = 0;
			let m;
			// biome-ignore lint/suspicious/noAssignInExpressions: classic regex.exec loop
			while ((m = regex.exec(src))) {
				// Find the line number for the match offset.
				const before = src.slice(0, m.index);
				const lineno = before.split("\n").length;
				const content = lines[lineno - 1]?.trim() ?? m[0];
				violations.push({ api, reason, file: rel, lineno, content });
			}
		}
	}
}

if (violations.length === 0) {
	console.log("✓ Identity/auth subscription guard passed — no leaks.");
	process.exit(0);
}

console.error("");
console.error("✗ Identity/auth subscription guard found leaks:");
console.error("");
for (const v of violations) {
	console.error(`  ${v.file}:${v.lineno}`);
	console.error(`    ${v.content}`);
	console.error(`    → ${v.reason}`);
	console.error("");
}
console.error(`Total: ${violations.length} violation(s).`);
console.error("See AGENTS.md → 'RULE: Identity/auth/labels via context, not subscriptions'.");
process.exit(1);
