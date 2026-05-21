"use client";

/**
 * EntityDetailRedirect — client wrapper that handles the dynamic detail
 * route `/[orgSlug]/[entitySlug]/[id]`.
 *
 * Locked decision (2026-05-20, per user request): deals do NOT have a
 * standalone detail page. Every deal lives on the owning person's
 * profile under the "Deals" tab, so when a link lands at
 * `/<orgSlug>/deals/<dealCode>` we redirect straight to
 * `/<orgSlug>/profile/<personCode>?group=deals`.
 *
 * The component subscribes to `useEntityLabels` first to resolve the
 * URL slug (`entitySlug`) into a canonical slot ("deal" / "company" /
 * "lead" / "contact"). For deals, it then queries
 * `crm.entities.deals.queries.getByDealCode` to find the personCode
 * attached to the deal record. As soon as the personCode is known the
 * router navigates away.
 *
 * For "company" we render a placeholder (CompanyDetailView is not yet
 * wired up). For "lead" / "contact" we redirect to `/profile/<code>`
 * because every person — lead or contact — already has a unified
 * profile page; there's no separate route.
 *
 * 2026-05-22 — `slot === "company"` now renders the real
 * `CompanyDetailView` (overview / users / files / timeline /
 * follow-ups / calendar tabs). The placeholder branch is gone.
 *
 * No detail page is built for deals on purpose — the user explicitly
 * asked for the redirect path so the deals tab on the profile is the
 * single place a deal is viewed in detail.
 */

import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { CompanyDetailView } from "@/core/entities/_entities/companies/views/CompanyDetailView";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
	useEntityLabels,
} from "@/core/shell/shared/hooks/useEntityLabels";

type Slot = "lead" | "contact" | "deal" | "company";

export function EntityDetailRedirect({
	orgSlug,
	entitySlug,
	id,
}: {
	orgSlug: string;
	entitySlug: string;
	id: string;
}) {
	const router = useRouter();
	const params = useParams();
	const locale = params?.locale as string | undefined;
	const labels = useEntityLabels();
	const { orgId, isLoading } = useCurrentOrg();

	const slot = useMemo<Slot | null>(() => {
		const map = buildSlugToSlotMap(labels);
		return map[entitySlug] ?? null;
	}, [labels, entitySlug]);

	// Deals: look up the deal by code and redirect to its owner's profile.
	const deal = useQuery(
		api.crm.entities.deals.queries.getByDealCode,
		slot === "deal" && orgId ? { orgId, dealCode: id } : "skip",
	);

	useEffect(() => {
		if (!slot) return;
		const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;

		// Lead / Contact — there's only ever one profile page per person,
		// regardless of whether they're still a lead or already a
		// contact. Redirect to it.
		if (slot === "lead" || slot === "contact") {
			router.replace(`${prefix}/profile/${id}`);
			return;
		}

		// Deals — wait for the deal doc to arrive, then redirect to the
		// owning person's profile (deals group). When the deal can't be
		// found we leave the user on a "not found" placeholder below.
		if (slot === "deal") {
			if (deal === undefined) return; // still loading
			if (deal === null) return; // not found — placeholder below
			if (deal.personCode) {
				router.replace(`${prefix}/profile/${deal.personCode}?group=deals`);
				return;
			}
			// Orphaned deal — no personCode. Stay put with the placeholder.
			return;
		}
	}, [slot, deal, id, locale, orgSlug, router]);

	// While we resolve the redirect, show a quiet loading state. Same
	// visual treatment whether the labels query is still loading, the
	// deal lookup is pending, or the redirect is mid-flight — the user
	// always sees "Loading…" rather than a flash of placeholder text.
	if (isLoading || (slot === "deal" && deal === undefined)) {
		return (
			<div
				data-org={orgSlug}
				data-slug={entitySlug}
				data-id={id}
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
			>
				Loading…
			</div>
		);
	}

	if (slot === "deal" && deal === null) {
		return (
			<div
				data-org={orgSlug}
				data-slug={entitySlug}
				data-id={id}
				className="flex h-full flex-col items-center justify-center gap-1 text-center"
			>
				<p className="text-sm font-medium">{labels.deal.singular} not found</p>
				<p className="text-xs text-muted-foreground">{id}</p>
			</div>
		);
	}

	if (slot === "deal" && deal && !deal.personCode) {
		return (
			<div
				data-org={orgSlug}
				data-slug={entitySlug}
				data-id={id}
				className="flex h-full flex-col items-center justify-center gap-1 text-center"
			>
				<p className="text-sm font-medium">
					No owner on this {labels.deal.singular.toLowerCase()}
				</p>
				<p className="text-xs text-muted-foreground">
					Deals are viewed on the owning person's profile, but this one has no person
					attached.
				</p>
			</div>
		);
	}

	// Companies: render the full tabbed detail view (overview, users,
	// files, timeline, follow-ups, calendar). Driven entirely by the
	// dynamic slug — bookmarks under the renamed slug (e.g. `/agencies/CO-001`)
	// land here too thanks to the shared slug→slot resolver.
	if (slot === "company") {
		return <CompanyDetailView orgSlug={orgSlug} companyCode={id} />;
	}

	// Anything else that fell through the resolver — defensive fallback.
	return (
		<div
			data-org={orgSlug}
			data-slug={entitySlug}
			data-id={id}
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{entitySlug} / {id} detail — coming soon
		</div>
	);
}

function buildSlugToSlotMap(labels: EntityLabels): Record<string, Slot> {
	return {
		[ENTITY_LABEL_DEFAULTS.lead.slug]: "lead",
		[ENTITY_LABEL_DEFAULTS.contact.slug]: "contact",
		[ENTITY_LABEL_DEFAULTS.deal.slug]: "deal",
		[ENTITY_LABEL_DEFAULTS.company.slug]: "company",
		[labels.lead.slug]: "lead",
		[labels.contact.slug]: "contact",
		[labels.deal.slug]: "deal",
		[labels.company.slug]: "company",
	};
}
