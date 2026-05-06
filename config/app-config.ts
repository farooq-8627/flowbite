/**
 * Application configuration.
 * All user-visible strings come from here — never hardcode app name in UI.
 * White-label: change these values (or override via env vars) per deployment.
 */
export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "Orbitly",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? "AI-Powered CRM for Gulf Businesses",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  version: "0.1.0",
  /**
   * Prefix used when generating platform-scoped org IDs.
   * e.g. "ORB" → platformOrgId = "ORB-00042"
   * Override via NEXT_PUBLIC_PLATFORM_PREFIX for white-label deployments.
   */
  platformPrefix: process.env.NEXT_PUBLIC_PLATFORM_PREFIX ?? "ORB",
} as const;
