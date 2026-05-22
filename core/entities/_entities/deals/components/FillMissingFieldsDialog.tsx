"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Id } from "@/convex/_generated/dataModel";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useDealFormSubmit } from "../hooks/useDealFormSubmit";

interface MissingField {
	name: string;
	label: string;
}

interface FillMissingFieldsDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	deal: { _id: Id<"deals">; dealCode?: string; personCode?: string } | null;
	targetStageName: string;
	missingFields: MissingField[];
	/** Called after successful save so parent can retry moveToStage. */
	onFilled: () => void;
}

const EMPTY: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function FillMissingFieldsDialog({
	open,
	onOpenChange,
	orgId,
	deal,
	targetStageName,
	missingFields,
	onFilled,
}: FillMissingFieldsDialogProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY);
	const save = useDealFormSubmit(orgId);

	const includeOnly = new Set(missingFields.map((f) => f.name));

	const handleSave = async () => {
		if (!orgId || !deal) return;
		setIsSubmitting(true);
		try {
			await save({
				dealId: deal._id,
				dealCode: deal.dealCode,
				personCode: deal.personCode,
				formValues: valuesGetterRef.current(),
				isCreate: false,
			});
			onOpenChange(false);
			onFilled();
		} catch {
			// save() handles toasts
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Fill required fields</DialogTitle>
					<DialogDescription>
						These {missingFields.length === 1 ? "field is" : "fields are"} required
						before moving to <strong>{targetStageName}</strong>. {labels.deal.singular}{" "}
						will move automatically after saving.
					</DialogDescription>
				</DialogHeader>

				<div className="py-2">
					<EntityFieldForm
						slot="deal"
						orgId={orgId}
						entity={deal as unknown as Record<string, unknown> & { _id: string }}
						currentStageId={undefined}
						includeOnly={includeOnly}
						registerGetValues={(getter) => {
							valuesGetterRef.current = getter;
						}}
					/>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSubmitting}>
						{isSubmitting ? "Saving…" : "Save & move"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
