"use client";

/**
 * EntityOverview — shared overview content used by EntityHoverCard AND profile tabs.
 * Real content: personCode, name, status, assignee, email, phone, tags.
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PersonCodeBadge } from "../PersonCodeBadge";
import type { PersonRef } from "../types";

interface EntityOverviewProps {
	person?: PersonRef;
	deal?: {
		dealCode: string;
		title: string;
		value?: number;
		stage?: string;
		assignee?: string;
		currencyCode?: string;
	};
	company?: {
		companyCode: string;
		name: string;
		industry?: string;
		contactCount?: number;
		openDealCount?: number;
		website?: string;
	};
}

export function EntityOverview({ person, deal, company }: EntityOverviewProps) {
	if (person) {
		return (
			<div className="flex flex-col gap-3 p-3">
				<div className="flex items-center gap-3">
					<Avatar className="size-10">
						<AvatarImage src={person.avatarUrl} alt={person.displayName} />
						<AvatarFallback>
							{person.displayName.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col gap-0.5">
						<p className="text-sm font-semibold leading-tight">{person.displayName}</p>
						{person.personCode && (
							<PersonCodeBadge personCode={person.personCode} clickable={false} />
						)}
					</div>
				</div>

				<Separator />

				<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
					{person.status && (
						<>
							<span className="text-muted-foreground">Status</span>
							<Badge variant="secondary" className="w-fit text-xs capitalize">
								{person.status}
							</Badge>
						</>
					)}
					{person.email && (
						<>
							<span className="text-muted-foreground">Email</span>
							<span className="truncate">{person.email}</span>
						</>
					)}
					{person.phone && (
						<>
							<span className="text-muted-foreground">Phone</span>
							<span>{person.phone}</span>
						</>
					)}
					<span className="text-muted-foreground">Type</span>
					<Badge variant="outline" className="w-fit text-xs capitalize">
						{person.type}
					</Badge>
				</div>
			</div>
		);
	}

	if (deal) {
		const formattedValue = deal.value
			? new Intl.NumberFormat(undefined, {
					style: "currency",
					currency: deal.currencyCode ?? "USD",
					maximumFractionDigits: 0,
				}).format(deal.value)
			: undefined;

		return (
			<div className="flex flex-col gap-3 p-3">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="font-mono text-xs">
						{deal.dealCode}
					</Badge>
					{deal.stage && (
						<Badge variant="secondary" className="text-xs">
							{deal.stage}
						</Badge>
					)}
				</div>
				<p className="text-sm font-semibold">{deal.title}</p>

				<Separator />

				<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
					{formattedValue && (
						<>
							<span className="text-muted-foreground">Value</span>
							<span className="font-medium tabular-nums">{formattedValue}</span>
						</>
					)}
					{deal.assignee && (
						<>
							<span className="text-muted-foreground">Assignee</span>
							<span>{deal.assignee}</span>
						</>
					)}
				</div>
			</div>
		);
	}

	if (company) {
		return (
			<div className="flex flex-col gap-3 p-3">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="font-mono text-xs">
						{company.companyCode}
					</Badge>
					{company.industry && (
						<Badge variant="secondary" className="text-xs capitalize">
							{company.industry}
						</Badge>
					)}
				</div>
				<p className="text-sm font-semibold">{company.name}</p>

				<Separator />

				<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
					{company.contactCount !== undefined && (
						<>
							<span className="text-muted-foreground">Contacts</span>
							<span className="tabular-nums">{company.contactCount}</span>
						</>
					)}
					{company.openDealCount !== undefined && (
						<>
							<span className="text-muted-foreground">Open Deals</span>
							<span className="tabular-nums">{company.openDealCount}</span>
						</>
					)}
					{company.website && (
						<>
							<span className="text-muted-foreground">Website</span>
							<a
								href={company.website}
								target="_blank"
								rel="noopener noreferrer"
								className="truncate text-primary hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{company.website.replace(/^https?:\/\//, "")}
							</a>
						</>
					)}
				</div>
			</div>
		);
	}

	return null;
}
