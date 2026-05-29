/**
 * core/ai/components/AIMark.tsx
 *
 * Canonical AI brand mark. Stage 1 of `DASHBOARD-V2-PLAN.md`
 * (2026-05-28) — replaces every `lucide:Bot` usage on AI surfaces
 * with a single component so the brand mark is the same everywhere
 * and a future re-skin is one file. The robot icon felt dated and
 * mismatched the AI-native positioning the user is moving toward;
 * `Sparkles` is the canonical mark across the AI vendor space
 * (Anthropic, OpenAI, Vercel, Linear) and pairs with the workspace's
 * theme primary tone.
 *
 * The component is an UNSTYLED layer over `<Sparkles>`:
 *   - `tone` switches between brand / muted / inverse so callers
 *     don't have to remember the right text-* class for each context.
 *   - `size` is a Tailwind size class (`size-3`, `size-4`, `size-5`,
 *     etc.) — defaults to `size-4` to match the existing `Bot` calls
 *     it replaces.
 *   - `aria-label` is REQUIRED when the mark is the only signal of
 *     "AI"; omitted (with `aria-hidden`) when next to readable text
 *     like "AI Assistant" or "AI Morning Briefing".
 *
 * RTL-safe: `<Sparkles>` is symmetric and doesn't need flipping.
 *
 * Why not Storybook entry now: the project doesn't ship Storybook
 * yet — first MDX entry would force adding the dev dependency. The
 * component is small enough that a unit test is the right shape; we
 * skip the dependency until a second AI mark variant lands.
 */

import { Sparkles } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "muted" | "inverse";

const TONE_CLASS: Record<Tone, string> = {
	brand: "text-primary",
	muted: "text-muted-foreground",
	inverse: "text-primary-foreground",
};

export interface AIMarkProps extends Omit<ComponentPropsWithoutRef<"svg">, "color"> {
	/**
	 * Tailwind size class — defaults to `size-4` to match the Bot
	 * usages this component replaces. Pass `size-3` for compact contexts
	 * (avatar subscript) and `size-5` for hero treatments.
	 */
	size?: string;
	/** Brand-tone resolver. Default `brand` (uses `text-primary`). */
	tone?: Tone;
	/**
	 * Accessible label. REQUIRED when the mark stands alone (no readable
	 * "AI" text nearby). Pass `aria-hidden="true"` when the mark is
	 * decorative and the surrounding text already says "AI".
	 */
	"aria-label"?: string;
}

export function AIMark({
	size = "size-4",
	tone = "brand",
	className,
	"aria-label": ariaLabel,
	"aria-hidden": ariaHidden,
	...rest
}: AIMarkProps) {
	return (
		<Sparkles
			className={cn(size, TONE_CLASS[tone], className)}
			aria-hidden={ariaHidden ?? (ariaLabel ? undefined : true)}
			aria-label={ariaLabel}
			{...rest}
		/>
	);
}
