"use client";

/**
 * AddLeadDrawer — form for creating a new lead.
 * Uses EntityFormDrawer + dedup handling.
 */

import { useState } from "react";
import type { Value as RPNValue } from "react-phone-number-input";
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
import type { Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import { LEAD_SOURCES } from "@/core/entities/shared/config/defaults";
import { useDedup } from "@/core/entities/shared/hooks/useDedup";
import type { PersonRef } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

interface AddLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	onCreate: (data: {
		displayName: string;
		email?: string;
		phone?: string;
		source: string;
		assignedTo?: Id<"users">;
	}) => Promise<unknown>;
}

export function AddLeadDrawer({ open, onOpenChange, orgId, onCreate }: AddLeadDrawerProps) {
	const labels = useEntityLabels();
	const { duplicates, handleError, clearDuplicates } = useDedup();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [source, setSource] = useState("manual");
	const [assignee, setAssignee] = useState<PersonRef | null>(null);

	const reset = () => {
		setDisplayName("");
		setEmail("");
		setPhone("");
		setSource("manual");
		setAssignee(null);
		clearDuplicates();
	};

	const handleSubmit = async () => {
		if (!displayName.trim()) return;
		setIsSubmitting(true);
		try {
			await onCreate({
				displayName: displayName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				source,
				assignedTo: assignee?.id as Id<"users"> | undefined,
			});
			reset();
			onOpenChange(false);
		} catch (err) {
			if (!handleError(err)) throw err;
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
			title={`Add ${labels.lead.singular}`}
			submitLabel="Create"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitDisabled={!displayName.trim()}
			duplicates={duplicates}
			onDismissDuplicates={clearDuplicates}
		>
			<div className="flex flex-col gap-3">
				<div className="space-y-1.5">
					<Label htmlFor="lead-name">Name *</Label>
					<Input
						id="lead-name"
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						placeholder="Full name"
						autoFocus
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="lead-email">Email</Label>
					<Input
						id="lead-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="email@example.com"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="lead-phone">Phone</Label>
					<PhoneInput
						id="lead-phone"
						value={phone as RPNValue}
						onChange={(v) => setPhone(v ?? "")}
						defaultCountry="AE"
						placeholder="50 000 0000"
						international
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Source</Label>
					<Select value={source} onValueChange={setSource}>
						<SelectTrigger className="w-full">
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
				</div>
				<div className="space-y-1.5">
					<Label>Assignee</Label>
					<PersonSelect
						scope="user"
						value={assignee}
						onChange={setAssignee}
						orgId={orgId}
						placeholder="Assign to…"
					/>
				</div>
			</div>
		</EntityFormDrawer>
	);
}
