"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DEFAULT_MODULES } from "@/core/shell/shell/config/navigation";

// Static label map for known non-module segments
const SEGMENT_LABELS: Record<string, string> = {
	settings: "Settings",
	notifications: "Notifications",
	appearance: "Appearance",
};

function labelForSegment(segment: string): string {
	if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
	// Check if it matches a module slug
	const mod = DEFAULT_MODULES.find((m) => m.slug === segment);
	if (mod) return mod.label;
	// Fallback: capitalise
	return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function AutoBreadcrumb() {
	const pathname = usePathname();
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	// Strip /{locale}/{orgSlug} prefix to get meaningful segments
	let stripped = pathname;
	if (locale) stripped = stripped.replace(`/${locale}`, "");
	if (orgSlug) stripped = stripped.replace(`/${orgSlug}`, "");

	const segments = stripped.split("/").filter(Boolean);
	const base = `/${locale ?? ""}/${orgSlug ?? ""}`.replace(/\/+$/, "");
	const dashboardHref = base;

	// Always show Dashboard as first crumb
	const isOnDashboard = segments.length === 0;

	const pageCrumbs = segments.map((seg, i) => ({
		label: labelForSegment(seg),
		href: `${base}/${segments.slice(0, i + 1).join("/")}`,
		isLast: i === segments.length - 1,
	}));

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					{isOnDashboard ? (
						<BreadcrumbPage>Dashboard</BreadcrumbPage>
					) : (
						<BreadcrumbLink asChild>
							<Link href={dashboardHref}>Dashboard</Link>
						</BreadcrumbLink>
					)}
				</BreadcrumbItem>
				{pageCrumbs.map((crumb) => (
					<span key={crumb.href} className="flex items-center gap-0.5 sm:gap-2.5">
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							{crumb.isLast ? (
								<BreadcrumbPage className="truncate max-w-[8rem] sm:max-w-none">
									{crumb.label}
								</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<Link
										href={crumb.href}
										className="truncate max-w-[6rem] sm:max-w-none"
									>
										{crumb.label}
									</Link>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</span>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
