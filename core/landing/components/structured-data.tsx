import { APP_CONFIG } from "@/config/app-config";
import { FAQS } from "@/core/landing/lib/content";

/**
 * JSON-LD structured data — powers rich results (SEO) and gives answer
 * engines / LLMs (AEO + GEO) clean, citable facts. Emits Organization,
 * SoftwareApplication, and FAQPage graphs.
 */
export function StructuredData() {
	const graph = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "Organization",
				name: APP_CONFIG.name,
				url: APP_CONFIG.url,
				description: APP_CONFIG.description,
			},
			{
				"@type": "SoftwareApplication",
				name: APP_CONFIG.name,
				applicationCategory: "BusinessApplication",
				operatingSystem: "Web",
				description:
					"AI-native CRM where users manage their pipeline through conversation. 115+ AI tools, two-step approval on every write, bring-your-own-key on every plan.",
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
					description: "Free plan with bring-your-own-key. Free Pro for early users.",
				},
			},
			{
				"@type": "FAQPage",
				mainEntity: FAQS.map((f) => ({
					"@type": "Question",
					name: f.q,
					acceptedAnswer: { "@type": "Answer", text: f.a },
				})),
			},
		],
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is a static, escaped object — required for structured data.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
		/>
	);
}
