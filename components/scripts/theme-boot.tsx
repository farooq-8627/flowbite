/**
 * ThemeBootScript — runs in <head> before hydration to prevent FOUC.
 * Reads preferences from cookies and sets data attributes on <html>.
 * Source: arhamkhnz/next-shadcn-admin-dashboard/src/scripts/theme-boot.tsx
 */
import { PREFERENCE_DEFAULTS, COOKIE_PREFIX } from "@/lib/preferences/preferences-config";

export function ThemeBootScript() {
  const defaults = JSON.stringify({
    theme_mode: PREFERENCE_DEFAULTS.theme_mode,
    theme_preset: PREFERENCE_DEFAULTS.theme_preset,
    font: PREFERENCE_DEFAULTS.font,
    content_layout: PREFERENCE_DEFAULTS.content_layout,
    navbar_style: PREFERENCE_DEFAULTS.navbar_style,
    sidebar_variant: PREFERENCE_DEFAULTS.sidebar_variant,
    sidebar_collapsible: PREFERENCE_DEFAULTS.sidebar_collapsible,
    radius: PREFERENCE_DEFAULTS.radius,
  });

  const prefix = JSON.stringify(COOKIE_PREFIX);

  const code = `
(function(){
  try{
    var root=document.documentElement;
    var D=${defaults};
    var P=${prefix};
    function rc(k){var m=document.cookie.split("; ").find(function(c){return c.startsWith(P+k+"=")});return m?decodeURIComponent(m.split("=")[1]):null}
    function g(k){return rc(k)||D[k]}
    var mode=g("theme_mode");
    var resolved=mode==="system"&&window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":mode;
    root.classList.toggle("dark",resolved==="dark");
    root.style.colorScheme=resolved;
    root.setAttribute("data-theme-mode",mode);
    root.setAttribute("data-theme-preset",g("theme_preset"));
    root.setAttribute("data-font",g("font"));
    root.setAttribute("data-content-layout",g("content_layout"));
    root.setAttribute("data-navbar-style",g("navbar_style"));
    root.setAttribute("data-sidebar-variant",g("sidebar_variant"));
    root.setAttribute("data-sidebar-collapsible",g("sidebar_collapsible"));
    root.style.setProperty("--radius",g("radius")+"rem");
  }catch(e){console.warn("ThemeBootScript:",e)}
})();`;

  // biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration boot script
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
