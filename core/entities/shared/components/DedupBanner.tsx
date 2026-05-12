"use client";

/**
 * DedupBanner — shown when lead creation detects a duplicate email.
 * Shows "Edit fields" + link to existing personCode. No Merge / Continue-anyway (D10).
 */

import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DedupResult } from "../hooks/useDedup";

interface DedupBannerProps {
	duplicates: DedupResult[];
	onDismiss?: () => void;
}

export function DedupBanner({ duplicates, onDismiss }: DedupBannerProps) {
	const params = useParams();
	const locale = params?.locale as string | undefined;
	const orgSlug = params?.orgSlug as string | undefined;

	if (duplicates.length === 0) return null;

	return (
		<Alert variant="destructive" className="mb-4">
			<AlertCircleIcon className="size-4" />
			<AlertTitle>Duplicate detected</AlertTitle>
			<AlertDescription className="space-y-2">
				{duplicates.map((d) => {
					const href =
						locale && orgSlug ? `/${locale}/${orgSlug}/profile/${d.personCode}` : `#`;
					return (
						<p key={d.personCode}>
							{d.message}{" "}
							<Link
								href={href}
								className="font-medium underline underline-offset-4"
								onClick={(e) => e.stopPropagation()}
							>
								View {d.personCode}
							</Link>
						</p>
					);
				})}
				{onDismiss && (
					<button type="button" onClick={onDismiss} className="text-xs underline">
						Edit fields instead
					</button>
				)}
			</AlertDescription>
		</Alert>
	);
}
