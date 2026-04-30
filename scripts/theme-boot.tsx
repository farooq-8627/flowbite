/**
 * Boot script that reads user preference values from cookies and applies
 * data-* attributes to <html> before hydration, preventing FOUC.
 *
 * Runs early in <head>. Keeps RootLayout fully static (no server cookie reads).
 */
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";

export function ThemeBootScript() {
  const defaults = JSON.stringify({
    theme_mode: PREFERENCE_DEFAULTS.theme_mode,
    theme_preset: PREFERENCE_DEFAULTS.theme_preset,
    font: PREFERENCE_DEFAULTS.font,
    content_layout: PREFERENCE_DEFAULTS.content_layout,
    navbar_style: PREFERENCE_DEFAULTS.navbar_style,
    sidebar_variant: PREFERENCE_DEFAULTS.sidebar_variant,
    sidebar_collapsible: PREFERENCE_DEFAULTS.sidebar_collapsible,
  });

  const code = `
    (function () {
      try {
        var root = document.documentElement;
        var DEFAULTS = ${defaults};
        var PREFIX = "orbitly-pref-";

        function readCookie(name) {
          var match = document.cookie.split("; ").find(function(c) {
            return c.startsWith(PREFIX + name + "=");
          });
          return match ? decodeURIComponent(match.split("=")[1]) : null;
        }

        function get(key) {
          return readCookie(key) || DEFAULTS[key];
        }

        var mode = get("theme_mode");
        var isValidMode = mode === "dark" || mode === "light" || mode === "system";
        if (!isValidMode) mode = DEFAULTS.theme_mode;

        var resolvedMode = mode === "system" && window.matchMedia
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : mode;

        root.classList.toggle("dark", resolvedMode === "dark");
        root.style.colorScheme = resolvedMode === "dark" ? "dark" : "light";
        root.setAttribute("data-theme-mode", mode);
        root.setAttribute("data-theme-preset", get("theme_preset"));
        root.setAttribute("data-font", get("font"));
        root.setAttribute("data-content-layout", get("content_layout"));
        root.setAttribute("data-navbar-style", get("navbar_style"));
        root.setAttribute("data-sidebar-variant", get("sidebar_variant"));
        root.setAttribute("data-sidebar-collapsible", get("sidebar_collapsible"));
      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;

  /* biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration boot script */
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
