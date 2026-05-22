"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	FileBufferProvider,
	useFileBuffer,
} from "@/core/data-io/files/components/CreateModeFileField";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import type { PersonRef } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useDealFormSubmit } from "../hooks/useDealFormSubmit";

/** Fields that should never appear in the create flow. */
export const EXCLUDED_FIELDS_FROM_CREATE_FORM = new Set(["currentStageId", "dealCode"]);

interface AddDealDrawerProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	pipelines: readonly Doc<"pipelines">[] | undefined;
	defaultPipelineId: Id<"pipelines"> | undefined;
	onCreate: (args: Record<string, unknown>) => Promise<unknown>;
}

export function AddDealDrawer({
	open,
	onOpenChange,
	orgId,
	pipelines,
	defaultPipelineId,
	onCreate,
}: AddDealDrawerProps) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const activePipeline = useMemo(
		() => pipelines?.find((p) => p._id === defaultPipelineId) ?? pipelines?.[0],
		[pipelines, defaultPipelineId],
	);

	const defaultStageId = useMemo(() => {
		if (!activePipeline) return undefined;
		const def = activePipeline.stages.find((s) => s.isDefaultStage === true);
		if (def) return def.id;
		const sorted = [...activePipeline.stages].sort((a, b) => a.order - b.order);
		return (sorted.find((s) => !s.isFinal) ?? sorted[0])?.id;
	}, [activePipeline]);

	const [person, setPerson] = useState<PersonRef | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const fileBuffer = useFileBuffer(orgId);
	const { reset: resetFileBuffer } = fileBuffer;

	useEffect(() => {
		if (open) return;
		setPerson(null);
		resetFileBuffer();
	}, [open, resetFileBuffer]);

	const valuesGetterRef = useRef<() => EntityFormValues>(() => ({
		columnValues: {},
		customValues: {},
		joinValues: {},
		fieldIdByName: {},
	}));

	const save = useDealFormSubmit(orgId);

	const hasPipeline = !!activePipeline && !!defaultStageId;
	const canSubmit = hasPipeline && !!person;

	const settingsHref =
		orgSlug && locale
			? `/${locale}/${orgSlug}/settings?group=pipelines`
			: orgSlug
				? `/${orgSlug}/settings?group=pipelines`
				: "/settings";

	const handleSubmit = async () => {
		if (!orgId || !activePipeline || !defaultStageId || !canSubmit || !person) return;
		setIsSubmitting(true);
		try {
			const formValues = valuesGetterRef.current();
			const col = formValues.columnValues;
			const titleRaw = String(col.title ?? "").trim();
			const title = titleRaw || `Deal for ${person.displayName ?? person.personCode}`;

			const created = (await onCreate({
				orgId,
				title,
				pipelineId: activePipeline._id,
				value:
					typeof col.value === "number"
						? col.value
						: typeof col.value === "string" && col.value
							? Number(col.value)
							: undefined,
				assignedTo: col.assignedTo as Id<"users"> | undefined,
				expectedCloseDate:
					typeof col.expectedCloseDate === "number" ? col.expectedCloseDate : undefined,
				currency: typeof col.currency === "string" ? col.currency : undefined,
				personCode: person.personCode,
				...(person.type === "contact" ? { contactId: person.id as Id<"contacts"> } : {}),
				source: "manual",
			})) as { dealId?: Id<"deals">; dealCode?: string } | undefined;

			await save({
				dealId: created?.dealId,
				dealCode: created?.dealCode,
				formValues,
				fileBuffer,
				personCode: person.personCode,
				isCreate: true,
			});

			onOpenChange(false);
		} catch {
			// save() handles individual toasts
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`Add ${labels.deal.singular}`}
			description={
				activePipeline
					? `Lands in "${activePipeline.name}" → Default stage. Configure fields in Settings → Pipelines.`
					: undefined
			}
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitLabel="Create"
			submitDisabled={!canSubmit}
		>
			<FileBufferProvider value={fileBuffer}>
				{!hasPipeline ? (
					<div className="flex flex-col items-start gap-3 rounded-[var(--radius)] border bg-amber-50/40 p-4 text-sm dark:bg-amber-900/10">
						<p className="font-medium">
							No pipelines yet for {labels.deal.plural.toLowerCase()}.
						</p>
						<p className="text-xs text-muted-foreground">
							Set up your first pipeline before creating a{" "}
							{labels.deal.singular.toLowerCase()}.
						</p>
						<Link
							href={settingsHref}
							className="text-xs font-medium text-primary underline-offset-2 hover:underline"
						>
							Open Settings → Pipelines →
						</Link>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<section className="flex flex-col gap-2.5">
							<div className="flex flex-col gap-1">
								<Label className="text-[11px] font-medium leading-none">
									{labels.contact.singular} or {labels.lead.singular}
									<span className="ms-0.5 text-destructive/60">*</span>
								</Label>
								<PersonSelect
									scope="person"
									value={person}
									onChange={setPerson}
									orgId={orgId}
									placeholder={`Who is this ${labels.deal.singular.toLowerCase()} for?`}
								/>
								<p className="text-[10px] leading-snug text-muted-foreground">
									Every {labels.deal.singular.toLowerCase()} belongs to a{" "}
									{labels.contact.singular.toLowerCase()} or{" "}
									{labels.lead.singular.toLowerCase()}.
								</p>
							</div>
						</section>
						<section className="flex flex-col gap-2.5">
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
									Details
								</span>
								<div className="h-px flex-1 bg-border" />
							</div>
							<EntityFieldForm
								slot="deal"
								orgId={orgId}
								currentStageId={defaultStageId}
								registerGetValues={(getter) => {
									valuesGetterRef.current = getter;
								}}
								excludeNames={EXCLUDED_FIELDS_FROM_CREATE_FORM}
							/>
						</section>
					</div>
				)}
			</FileBufferProvider>
		</FormDrawer>
	);
}
