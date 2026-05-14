"use client";

/**
 * EditLeadDrawer — edit form for an existing lead.
 *
 * Mirrors AddLeadDrawer's layout (label-left grid + custom fields section)
 * but writes through `leads.mutations.update` and pre-fills from a Doc.
 * RBAC is enforced server-side; the form is shown to anyone who can already
 * see the lead.
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import type { Value as RPNValue } from "react-phone-number-input";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import { CustomFieldsSection } from "@/core/entities/shared/components/CustomFieldsSection";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/core/entities/shared/config/defaults";
import type { PersonRef } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

interface EditLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	lead: Doc<"leads"> | null;
}

export function EditLeadDrawer({ open, onOpenChange, orgId, lead }: EditLeadDrawerProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [source, setSource] = useState("manual");
	const [status, setStatus] = useState("new");
	const [assignee, setAssignee] = useState<PersonRef | null>(null);

	const update = useMutation(api.crm.entities.leads.mutations.update);

	useEffect(() => {
		if (!open || !lead) return;
		setDisplayName(lead.displayName ?? "");
		setEmail(lead.email ?? "");
		setPhone(lead.phone ?? "");
		setSource(lead.source ?? "manual");
		setStatus(lead.status ?? "new");
		setAssignee(
			lead.assignedTo
				? {
						id: lead.assignedTo as string,
						type: "user",
						displayName: "",
					}
				: null,
		);
	}, [open, lead]);

	const handleSubmit = async () => {
		if (!orgId || !lead || !displayName.trim()) return;
		setIsSubmitting(true);
		try {
			await update({
				orgId,
				leadId: lead._id as Id<"leads">,
				displayName: displayName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				source,
				status,
				assignedTo: (assignee?.id as Id<"users"> | undefined) ?? undefined,
			});
			toast.success(`${labels.lead.singular} updated`);
			onOpenChange(false);
		} catch (err) {
			toast.error(`Couldn't update ${labels.lead.singular.toLowerCase()}`, {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`Edit ${labels.lead.singular}`}
			submitLabel="Save"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitDisabled={!displayName.trim()}
		>
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
					<Label className="text-xs">Name *</Label>
					<Input
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Email</Label>
					<Input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Phone</Label>
					<PhoneInput
						value={phone as RPNValue}
						onChange={(v) => setPhone(v ?? "")}
						defaultCountry="AE"
						international
					/>
					<Label className="text-xs">Status</Label>
					<Select value={status} onValueChange={setStatus}>
						<SelectTrigger className="h-8 text-xs capitalize">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LEAD_STATUSES.map((s) => (
								<SelectItem key={s} value={s} className="capitalize">
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Label className="text-xs">Source</Label>
					<Select value={source} onValueChange={setSource}>
						<SelectTrigger className="h-8 text-xs capitalize">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LEAD_SOURCES.map((s) => (
								<SelectItem key={s} value={s} className="capitalize">
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Label className="text-xs">Assignee</Label>
					<PersonSelect
						scope="user"
						value={assignee}
						onChange={setAssignee}
						orgId={orgId}
						placeholder="Assign to…"
					/>
				</div>
				<Separator />
				<CustomFieldsSection
					orgId={orgId}
					entityType="leads"
					entityId={lead?._id as string | undefined}
					layout="grid"
				/>
			</div>
		</EntityFormDrawer>
	);
}
