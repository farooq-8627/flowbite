"use client";

/**
 * NewConversationDialog — search existing chats AND start new ones.
 *
 * 2026-05-16 redesign (per user direction):
 *   - This dialog is now the SINGLE entry point for both "find someone I'm
 *     already chatting with" and "start a new conversation". The sidebar's
 *     standalone search input was misleading — it searched message previews,
 *     not the contact graph. Both flows live here now.
 *   - Unified row layout: rounded-full avatar (start), name + email/phone,
 *     personCode badge (end). No more separate "Leads" / "Contacts" /
 *     "Deals" / "Companies" groups. The kind is shown as a small label
 *     next to the code badge.
 *   - cmdk's `keywords` prop now receives the FULL searchable surface
 *     (name, code, kind, email, phone) — fixes the bug where "search by
 *     email" and "search by code" returned nothing.
 *   - Sections (in order): Recent (localStorage), Already chatting,
 *     Start a new conversation. Each is collapsible-by-emptiness — empty
 *     sections render no header.
 *
 * On select → `ensureForEntity` mutation → returns conversationId. We hand
 * the id back to the parent (sidebar) which sets it as `selected`. The
 * thread mounts and is ready for the first message. If the conversation
 * already exists for the chosen target, ensureForEntity is idempotent and
 * returns the existing id — feels like "open existing" to the user.
 */
import { useMutation, useQuery } from "convex/react";
import { Building2, MessageSquare, MessageSquarePlus, Tag, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatEntityType } from "@/core/comms/messages/hooks";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";

type Props = {
	orgId: Id<"orgs">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called with the resolved conversation id after successful ensure. */
	onCreated: (conversationId: Id<"conversations">) => void;
};

type PickerRow = {
	entityType: ChatEntityType;
	entityId: string; // entity code (P-001, D-042, CO-007)
	primary: string; // display name / title
	secondary?: string; // email, dealCode, etc.
	kindLabel: string; // "Lead", "Contact", "Deal", "Company"
	icon: React.ComponentType<{ className?: string }>;
	avatarUrl?: string;
	/** All extra strings that should match a search query — fed to cmdk. */
	searchKeywords: string[];
};

const RECENTS_KEY = "messages:newConvoRecents:v1";
const MAX_RECENTS = 5;

type RecentRef = { entityType: ChatEntityType; entityId: string };

/**
 * Compute the canonical conversation lookup key for a picker row.
 * Lead/contact rows collapse to "person" so they match conversations
 * already created under the canonical key (post 2026-05-19 normalisation).
 */
function pickerKeyFor(row: PickerRow): string {
	const t =
		row.entityType === "lead" || row.entityType === "contact"
			? "person"
			: row.entityType;
	return `${t}:${row.entityId}`;
}

function loadRecents(): RecentRef[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(RECENTS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(r): r is RecentRef =>
				typeof r === "object" &&
				r !== null &&
				typeof (r as RecentRef).entityType === "string" &&
				typeof (r as RecentRef).entityId === "string",
		);
	} catch {
		return [];
	}
}

function saveRecent(ref: RecentRef) {
	if (typeof window === "undefined") return;
	try {
		const next = [ref, ...loadRecents().filter((r) => r.entityId !== ref.entityId)].slice(
			0,
			MAX_RECENTS,
		);
		window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
	} catch {
		// localStorage may be disabled — silently degrade.
	}
}

export function NewConversationDialog({ orgId, open, onOpenChange, onCreated }: Props) {
	const [creating, setCreating] = useState(false);
	const [recents, setRecents] = useState<RecentRef[]>(() => loadRecents());
	const ensureForEntity = useMutation(api.crm.shared.conversations.mutations.ensureForEntity);

	// Refresh recents list every time the dialog opens.
	useEffect(() => {
		if (open) setRecents(loadRecents());
	}, [open]);

	// All sources fetched in parallel (only when open). Each is bounded server-side.
	// 2026-05-18: collapsed three subscriptions (`people.listAll`, `deals.list`,
	// `companies.list`) into a single `listForConversationPicker` server query
	// — see AGENTS.md "Per-row data on a list view comes from one batched
	// query". Also drops the messages page from 4 list subscriptions to 2.
	const picker = useQuery(
		api.crm.people.queries.listForConversationPicker,
		open ? { orgId } : "skip",
	);
	const people = picker?.people;
	const deals = picker?.deals;
	const companies = picker?.companies;
	const inbox = useQuery(
		api.crm.shared.conversations.queries.listForUser,
		open ? { orgId, filter: "all" } : "skip",
	);

	const allRows = useMemo<PickerRow[]>(() => {
		const out: PickerRow[] = [];
		for (const p of people ?? []) {
			const pp = p as {
				type: "lead" | "contact";
				personCode: string;
				displayName: string;
				email?: string;
				phone?: string;
				avatarUrl?: string;
			};
			out.push({
				entityType: pp.type === "lead" ? "lead" : "contact",
				entityId: pp.personCode,
				primary: pp.displayName,
				secondary: pp.phone ?? pp.email,
				kindLabel: pp.type === "lead" ? "Lead" : "Contact",
				icon: pp.type === "lead" ? Tag : User,
				avatarUrl: pp.avatarUrl,
				searchKeywords: [
					pp.displayName,
					pp.personCode,
					pp.email ?? "",
					pp.phone ?? "",
					pp.type === "lead" ? "Lead" : "Contact",
				].filter(Boolean),
			});
		}
		for (const d of deals ?? []) {
			const dd = d as { dealCode: string; title: string };
			out.push({
				entityType: "deal",
				entityId: dd.dealCode,
				primary: dd.title,
				secondary: dd.dealCode,
				kindLabel: "Deal",
				icon: MessageSquarePlus,
				searchKeywords: [dd.title, dd.dealCode, "Deal"],
			});
		}
		for (const c of companies ?? []) {
			const cc = c as { companyCode: string; name: string };
			out.push({
				entityType: "company",
				entityId: cc.companyCode,
				primary: cc.name,
				secondary: cc.companyCode,
				kindLabel: "Company",
				icon: Building2,
				searchKeywords: [cc.name, cc.companyCode, "Company"],
			});
		}
		return out;
	}, [people, deals, companies]);

	// Build a fast lookup of entityId → row (used by recents + already-chatting sets).
	// For lead/contact rows we also index under the normalised "person:<code>"
	// key so recents stored under the canonical key (set by handleSelect)
	// still resolve to the picker row.
	const rowsByKey = useMemo(() => {
		const map = new Map<string, PickerRow>();
		for (const r of allRows) {
			map.set(`${r.entityType}:${r.entityId}`, r);
			if (r.entityType === "lead" || r.entityType === "contact") {
				map.set(`person:${r.entityId}`, r);
			}
		}
		return map;
	}, [allRows]);

	// Set of entityIds the user is already in a conversation with — used to
	// split rows into "already chatting" vs "start a new conversation".
	// We key on the NORMALISED entityType (lead/contact → person) so a
	// person whose conversation lives on `entityType=person` is matched
	// regardless of whether the picker row is a lead or contact card.
	const chattingKeys = useMemo(() => {
		const set = new Set<string>();
		for (const row of inbox ?? []) {
			const conv = row.conversation as { entityType: string; entityId: string };
			set.add(`${conv.entityType}:${conv.entityId}`);
		}
		return set;
	}, [inbox]);

	const recentRows = useMemo<PickerRow[]>(() => {
		const out: PickerRow[] = [];
		for (const r of recents) {
			const found = rowsByKey.get(`${r.entityType}:${r.entityId}`);
			if (found) out.push(found);
		}
		return out;
	}, [recents, rowsByKey]);

	const chatting = useMemo(
		() => allRows.filter((r) => chattingKeys.has(pickerKeyFor(r))),
		[allRows, chattingKeys],
	);
	const others = useMemo(
		() => allRows.filter((r) => !chattingKeys.has(pickerKeyFor(r))),
		[allRows, chattingKeys],
	);

	const isLoading = people === undefined || deals === undefined || companies === undefined;

	const handleSelect = useCallback(
		async (row: PickerRow) => {
			if (creating) return;
			setCreating(true);
			try {
				// Normalise lead/contact → person at the boundary. The server
				// also normalises (defence in depth), but doing it here means
				// the recents list keys on the canonical type — picking the
				// same person from the lead row or the contact row resolves
				// to the same recent entry.
				const normalisedType =
					row.entityType === "lead" || row.entityType === "contact"
						? "person"
						: row.entityType;
				const conversationId = await ensureForEntity({
					orgId,
					entityType: normalisedType,
					entityId: row.entityId,
				});
				saveRecent({ entityType: normalisedType, entityId: row.entityId });
				onCreated(conversationId);
				onOpenChange(false);
			} finally {
				setCreating(false);
			}
		},
		[creating, ensureForEntity, onCreated, onOpenChange, orgId],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="border-b border-border p-4">
					<DialogTitle className="flex items-center gap-2 text-base">
						<MessageSquarePlus
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
						Search or start a conversation
					</DialogTitle>
					<DialogDescription>
						Search by name, code, email, or phone — or pick a contact, deal, or company
						to begin a new thread.
					</DialogDescription>
				</DialogHeader>

				<Command className="rounded-none">
					<CommandInput
						placeholder="Type a name, code, email, or phone…"
						aria-label="Search entities"
					/>
					<CommandList className="max-h-96">
						{isLoading ? (
							<div className="px-4 py-8 text-center text-xs text-muted-foreground">
								Loading…
							</div>
						) : (
							<>
								<CommandEmpty>
									Nothing matches. Try a different name, code, or email.
								</CommandEmpty>

								{recentRows.length > 0 && (
									<>
										<CommandGroup heading="Recent">
											{recentRows.map((r) => (
												<EntityRow
													key={`recent:${r.entityType}:${r.entityId}`}
													row={r}
													onSelect={handleSelect}
													disabled={creating}
												/>
											))}
										</CommandGroup>
										<CommandSeparator />
									</>
								)}

								{chatting.length > 0 && (
									<CommandGroup heading="Already chatting">
										{chatting.map((r) => (
											<EntityRow
												key={`chat:${r.entityType}:${r.entityId}`}
												row={r}
												onSelect={handleSelect}
												disabled={creating}
											/>
										))}
									</CommandGroup>
								)}

								{chatting.length > 0 && others.length > 0 && <CommandSeparator />}

								{others.length > 0 && (
									<CommandGroup heading="Start a new conversation">
										{others.map((r) => (
											<EntityRow
												key={`new:${r.entityType}:${r.entityId}`}
												row={r}
												onSelect={handleSelect}
												disabled={creating}
											/>
										))}
									</CommandGroup>
								)}
							</>
						)}
					</CommandList>
				</Command>

				<div className="flex items-center justify-between gap-2 border-t border-border p-3">
					<p className="text-[11px] text-muted-foreground">
						<MessageSquare className="me-1 inline size-3" aria-hidden="true" />
						Tip: search works across names, codes, emails, and phone numbers.
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function EntityRow({
	row,
	onSelect,
	disabled,
}: {
	row: PickerRow;
	onSelect: (row: PickerRow) => void;
	disabled: boolean;
}) {
	return (
		<CommandItem
			value={`${row.entityType}:${row.entityId}:${row.primary}`}
			keywords={row.searchKeywords}
			disabled={disabled}
			onSelect={() => onSelect(row)}
			className={cn("flex items-center gap-3 py-2", disabled && "opacity-50")}
		>
			<ChatAvatar name={row.primary} src={row.avatarUrl} size={2} className="shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm text-foreground">{row.primary}</span>
				{row.secondary && (
					<span className="truncate text-xs text-muted-foreground">{row.secondary}</span>
				)}
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					{row.entityId}
				</span>
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					{row.kindLabel}
				</span>
			</div>
		</CommandItem>
	);
}
