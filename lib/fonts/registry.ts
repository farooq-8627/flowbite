/**
 * Font registry — 18 Google Fonts available for dynamic font switching.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * Each font exports a Next.js `next/font/google` instance with a CSS variable.
 * The active font is applied via `data-font` attribute on <html>,
 * and global CSS maps the variable to font-family.
 */

import {
  DM_Sans,
  Geist,
  Geist_Mono,
  IBM_Plex_Sans,
  Inter,
  Josefin_Sans,
  Lato,
  Libre_Baskerville,
  Merriweather,
  Montserrat,
  Nunito,
  Open_Sans,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Raleway,
  Roboto,
  Source_Code_Pro,
} from "next/font/google";

// --- Font Instances ---

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
  display: "swap",
});

export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const lato = Lato({
  weight: ["100", "300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

export const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const ibmPlexSans = IBM_Plex_Sans({
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

export const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin-sans",
  display: "swap",
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  display: "swap",
});

export const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-merriweather",
  display: "swap",
});

export const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-libre-baskerville",
  display: "swap",
});

export const sourceCodePro = Source_Code_Pro({
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
}

export const FONT_REGISTRY: FontEntry[] = [
  { key: "geist",               label: "Geist",               variable: "--font-geist",               category: "sans-serif" },
  { key: "inter",               label: "Inter",               variable: "--font-inter",               category: "sans-serif" },
  { key: "outfit",              label: "Outfit",              variable: "--font-outfit",              category: "sans-serif" },
  { key: "dm-sans",             label: "DM Sans",             variable: "--font-dm-sans",             category: "sans-serif" },
  { key: "plus-jakarta-sans",   label: "Plus Jakarta Sans",   variable: "--font-plus-jakarta-sans",   category: "sans-serif" },
  { key: "montserrat",          label: "Montserrat",          variable: "--font-montserrat",          category: "sans-serif" },
  { key: "raleway",             label: "Raleway",             variable: "--font-raleway",             category: "sans-serif" },
  { key: "nunito",              label: "Nunito",              variable: "--font-nunito",              category: "sans-serif" },
  { key: "lato",                label: "Lato",                variable: "--font-lato",                category: "sans-serif" },
  { key: "roboto",              label: "Roboto",              variable: "--font-roboto",              category: "sans-serif" },
  { key: "open-sans",           label: "Open Sans",           variable: "--font-open-sans",           category: "sans-serif" },
  { key: "ibm-plex-sans",       label: "IBM Plex Sans",       variable: "--font-ibm-plex-sans",       category: "sans-serif" },
  { key: "josefin-sans",        label: "Josefin Sans",        variable: "--font-josefin-sans",        category: "sans-serif" },
  { key: "playfair-display",    label: "Playfair Display",    variable: "--font-playfair-display",    category: "serif"      },
  { key: "merriweather",        label: "Merriweather",        variable: "--font-merriweather",        category: "serif"      },
  { key: "libre-baskerville",   label: "Libre Baskerville",   variable: "--font-libre-baskerville",   category: "serif"      },
  { key: "source-code-pro",     label: "Source Code Pro",     variable: "--font-source-code-pro",     category: "monospace"  },
  { key: "geist-mono",          label: "Geist Mono",          variable: "--font-geist-mono",          category: "monospace"  },
];

/**
 * All font instances — spread their className onto <html> in the root layout.
 * This registers the CSS variables without activating them.
 */
export const ALL_FONT_CLASSES = [
  geist,
  geistMono,
  inter,
  outfit,
  dmSans,
  plusJakartaSans,
  montserrat,
  raleway,
  nunito,
  lato,
  roboto,
  openSans,
  ibmPlexSans,
  josefinSans,
  playfairDisplay,
  merriweather,
  libreBaskerville,
  sourceCodePro,
];

/** Get the CSS variable for a given font key */
export function getFontVariable(key: string): string {
  return FONT_REGISTRY.find((f) => f.key === key)?.variable ?? "--font-geist";
}

/** Get the combined className string for all fonts (for root layout) */
export function getAllFontClassNames(): string {
  return ALL_FONT_CLASSES.map((f) => f.className).join(" ");
}
