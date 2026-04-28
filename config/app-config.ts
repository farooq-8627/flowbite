/**
 * Application configuration
 */

export const APP_CONFIG = {
	name: "FlowBite",
	description: "Modern SaaS platform built with Next.js and Convex",
	url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	version: "0.1.0",
} as const;
