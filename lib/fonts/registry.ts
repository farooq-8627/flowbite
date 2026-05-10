/**
 * Font registry — Google Fonts available for dynamic font switching.
 *
 * Architecture (matches next-shadcn-admin-dashboard reference):
 * 1. Each font exports a next/font/google instance with a CSS variable.
 * 2. `fontVars` is a space-separated string of all `.variable` class names.
 *    It MUST be applied to <body> in the root layout → this registers
 *    every CSS variable (e.g., --font-geist, --font-nunito-sans) on body.
 * 3. The active font is applied via `data-font` attribute on <html>.
 * 4. CSS in globals.css uses `html[data-font="X"] body { --app-font: var(--font-X) }`
 *    — the override lands on <body>, where the variables actually live.
 *    This is critical: CSS variables cascade parent→child, so the override
 *    MUST be on the element (body) that holds the variables.
 */

import {
	DM_Sans,
	Figtree,
	Geist,
	Geist_Mono,
	IBM_Plex_Sans,
	Inter,
	JetBrains_Mono,
	Lora,
	Merriweather,
	Montserrat,
	Noto_Sans,
	Noto_Serif,
	Nunito,
	Nunito_Sans,
	Outfit,
	Playfair_Display,
	Plus_Jakarta_Sans,
	Public_Sans,
	Raleway,
	Roboto,
	Roboto_Slab,
	Source_Code_Pro,
} from "next/font/google";

// --- Font Instances ---

const nunitoSans = Nunito_Sans({
	subsets: ["latin"],
	variable: "--font-nunito-sans",
	display: "swap",
});

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist",
	display: "swap",
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
	display: "swap",
});

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const notoSans = Noto_Sans({
	subsets: ["latin"],
	variable: "--font-noto-sans",
	display: "swap",
});

const outfit = Outfit({
	subsets: ["latin"],
	variable: "--font-outfit",
	display: "swap",
});

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm-sans",
	display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-plus-jakarta-sans",
	display: "swap",
});

const publicSans = Public_Sans({
	subsets: ["latin"],
	variable: "--font-public-sans",
	display: "swap",
});

const figtree = Figtree({
	subsets: ["latin"],
	variable: "--font-figtree",
	display: "swap",
});

const montserrat = Montserrat({
	subsets: ["latin"],
	variable: "--font-montserrat",
	display: "swap",
});

const raleway = Raleway({
	subsets: ["latin"],
	variable: "--font-raleway",
	display: "swap",
});

const nunito = Nunito({
	subsets: ["latin"],
	variable: "--font-nunito",
	display: "swap",
});

const roboto = Roboto({
	subsets: ["latin"],
	variable: "--font-roboto",
	display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
	weight: ["100", "200", "300", "400", "500", "600", "700"],
	subsets: ["latin"],
	variable: "--font-ibm-plex-sans",
	display: "swap",
});

const playfairDisplay = Playfair_Display({
	subsets: ["latin"],
	variable: "--font-playfair-display",
	display: "swap",
});

const merriweather = Merriweather({
	weight: ["300", "400", "700", "900"],
	subsets: ["latin"],
	variable: "--font-merriweather",
	display: "swap",
});

const lora = Lora({
	subsets: ["latin"],
	variable: "--font-lora",
	display: "swap",
});

const notoSerif = Noto_Serif({
	subsets: ["latin"],
	variable: "--font-noto-serif",
	display: "swap",
});

const robotoSlab = Roboto_Slab({
	subsets: ["latin"],
	variable: "--font-roboto-slab",
	display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains-mono",
	display: "swap",
});

const sourceCodePro = Source_Code_Pro({
	subsets: ["latin"],
	variable: "--font-source-code-pro",
	display: "swap",
});

// --- Font Registry ---

export interface FontEntry {
	key: string;
	label: string;
	variable: string;
	category: "sans-serif" | "serif" | "monospace";
	font: { variable: string };
}

/**
 * All fonts in display order. Default (nunito-sans) comes first.
 * Each entry includes the next/font instance so fontVars can be built automatically.
 */
export const FONT_REGISTRY = [
	{ key: "nunito-sans", label: "Nunito Sans", variable: "--font-nunito-sans", category: "sans-serif", font: nunitoSans },
	{ key: "geist", label: "Geist", variable: "--font-geist", category: "sans-serif", font: geist },
	{ key: "inter", label: "Inter", variable: "--font-inter", category: "sans-serif", font: inter },
	{ key: "noto-sans", label: "Noto Sans", variable: "--font-noto-sans", category: "sans-serif", font: notoSans },
	{ key: "figtree", label: "Figtree", variable: "--font-figtree", category: "sans-serif", font: figtree },
	{ key: "public-sans", label: "Public Sans", variable: "--font-public-sans", category: "sans-serif", font: publicSans },
	{ key: "dm-sans", label: "DM Sans", variable: "--font-dm-sans", category: "sans-serif", font: dmSans },
	{ key: "plus-jakarta-sans", label: "Plus Jakarta Sans", variable: "--font-plus-jakarta-sans", category: "sans-serif", font: plusJakartaSans },
	{ key: "outfit", label: "Outfit", variable: "--font-outfit", category: "sans-serif", font: outfit },
	{ key: "montserrat", label: "Montserrat", variable: "--font-montserrat", category: "sans-serif", font: montserrat },
	{ key: "raleway", label: "Raleway", variable: "--font-raleway", category: "sans-serif", font: raleway },
	{ key: "nunito", label: "Nunito", variable: "--font-nunito", category: "sans-serif", font: nunito },
	{ key: "roboto", label: "Roboto", variable: "--font-roboto", category: "sans-serif", font: roboto },
	{ key: "ibm-plex-sans", label: "IBM Plex Sans", variable: "--font-ibm-plex-sans", category: "sans-serif", font: ibmPlexSans },
	{ key: "playfair-display", label: "Playfair Display", variable: "--font-playfair-display", category: "serif", font: playfairDisplay },
	{ key: "merriweather", label: "Merriweather", variable: "--font-merriweather", category: "serif", font: merriweather },
	{ key: "lora", label: "Lora", variable: "--font-lora", category: "serif", font: lora },
	{ key: "noto-serif", label: "Noto Serif", variable: "--font-noto-serif", category: "serif", font: notoSerif },
	{ key: "roboto-slab", label: "Roboto Slab", variable: "--font-roboto-slab", category: "serif", font: robotoSlab },
	{ key: "geist-mono", label: "Geist Mono", variable: "--font-geist-mono", category: "monospace", font: geistMono },
	{ key: "jetbrains-mono", label: "JetBrains Mono", variable: "--font-jetbrains-mono", category: "monospace", font: jetBrainsMono },
	{ key: "source-code-pro", label: "Source Code Pro", variable: "--font-source-code-pro", category: "monospace", font: sourceCodePro },
] as const satisfies readonly FontEntry[];

/** Font key type — union of every `key` in the registry */
export type FontKey = (typeof FONT_REGISTRY)[number]["key"];

/** All valid font keys (for runtime validation) */
export const FONT_KEYS = FONT_REGISTRY.map((f) => f.key) as readonly FontKey[];

/** Font options for select dropdowns */
export const fontOptions = FONT_REGISTRY.map((f) => ({
	key: f.key,
	label: f.label,
	category: f.category,
}));

/**
 * Space-separated string of every font's `.variable` className.
 * MUST be applied to <body> in the root layout so all font CSS variables
 * are defined on the body element. The CSS selector
 * `html[data-font="X"] body { --app-font: var(--font-X) }` then reads
 * these variables from body (where they live) when setting --app-font.
 */
export const fontVars = FONT_REGISTRY.map((f) => f.font.variable).join(" ");

/** Get the CSS variable name for a given font key (fallback: --font-nunito-sans) */
export function getFontVariable(key: string): string {
	return FONT_REGISTRY.find((f) => f.key === key)?.variable ?? "--font-nunito-sans";
}

/** Validate that a string is a known font key */
export function isValidFontKey(value: string): value is FontKey {
	return (FONT_KEYS as readonly string[]).includes(value);
}
