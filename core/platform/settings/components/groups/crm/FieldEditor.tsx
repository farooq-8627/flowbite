"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { CreateFieldDialog } from "./CreateFieldDialog";
import { EditFieldDialog } from "./EditFieldDialog";
import { SortableFieldsTable } from "./SortableFieldsTable";

type FieldDef = Doc<"fieldDefinitions">;

export function FieldEditor({ orgId, entityType }: { orgId: Id<"orgs">; entityType: string }) {
	const fields = useQuery(api.crm.fields.fieldDefinitions.queries.listByEntity, {
		orgId,
		entityType,
	});
	const remove = useMutation(api.crm.fields.fieldDefinitions.mutations.remove);
	const update = useMutation(api.crm.fields.fieldDefinitions.mutations.update);
	const reorder = useMutation(api.crm.fields.fieldDefinitions.mutations.reorder);

	const [editing, setEditing] = useState<FieldDef | null>(null);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-end">
				<CreateFieldDialog orgId={orgId} entityType={entityType} />
			</div>

			{fields === undefined ? null : fields.length === 0 ? (
				<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
					No custom fields yet — click <b>Add field</b> to create one.
				</div>
			) : (
				<SortableFieldsTable
					orgId={orgId}
					fields={fields}
					setEditing={setEditing}
					update={update}
					remove={remove}
					reorder={reorder}
				/>
			)}

			{editing && (
				<EditFieldDialog
					orgId={orgId}
					field={editing}
					open={!!editing}
					onOpenChange={(v) => !v && setEditing(null)}
				/>
			)}
		</div>
	);
}
