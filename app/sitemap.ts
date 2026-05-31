import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app-config";

export default function sitemap(): MetadataRoute.Sitemap {
	const base = APP_CONFIG.url;
	const now = new Date();
	return [
		{ url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
		{ url: `${base}/signin`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
	];
}
