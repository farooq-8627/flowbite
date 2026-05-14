/**
 * Industry field templates — convex/orgs/templates/fields.ts
 *
 * Defines the default `fieldDefinitions` rows seeded into a new org during
 * onboarding (Step 2 — `updateOrgIndustry`). Admin can hide / rename / reorder
 * these rows after seeding; only `protected: true` rows resist deletion.
 *
 * KIND CONVENTION:
 *   System fields whose data lives on the entity row itself use:
 *     - `kind`: a semantic tag (`status`, `assignee`, `personCode`, `tags`,
 *       `company-ref`, `stage`, …) that the renderer / editor dispatches on.
 *     - `storage`: "column" | "join" — tells code where to read/write.
 *     - `columnKey`: the entity column name when storage="column".
 *
 * Custom (admin-created) fields default to:
 *     - `kind` mirrors `type` (e.g. "text", "number", "select")
 *     - `storage`: "fieldValues"
 *     - no `columnKey`.
 */

export type FieldDefinitionSeed = {
	entityType: string;
	name: string;
	label: string;
	type: string;
	kind?: string;
	storage?: "column" | "fieldValues" | "join";
	columnKey?: string;
	system?: boolean;
	protected?: boolean;
	options?: string[];
	required?: boolean;
};

// ─── Built-in (always-seeded) fields shared by every industry ────────────────
// These mirror the previous hardcoded FIELD_CATALOG. Admin can hide or rename.
const BUILT_IN_LEAD_FIELDS: FieldDefinitionSeed[] = [
	{
		entityType: "lead",
		name: "personCode",
		label: "Person Code",
		type: "text",
		kind: "personCode",
		storage: "column",
		columnKey: "personCode",
		system: true,
		protected: true,
	},
	{
		entityType: "lead",
		name: "displayName",
		label: "Name",
		type: "text",
		kind: "displayName",
		storage: "column",
		columnKey: "displayName",
		system: true,
		protected: true,
	},
	{
		entityType: "lead",
		name: "email",
		label: "Email",
		type: "email",
		kind: "email",
		storage: "column",
		columnKey: "email",
		system: true,
	},
	{
		entityType: "lead",
		name: "phone",
		label: "Phone",
		type: "text",
		kind: "phone",
		storage: "column",
		columnKey: "phone",
		system: true,
	},
	{
		entityType: "lead",
		name: "status",
		label: "Status",
		type: "select",
		kind: "status",
		storage: "column",
		columnKey: "status",
		options: ["new", "contacted", "qualified", "converted", "lost"],
		system: true,
		protected: true,
	},
	{
		entityType: "lead",
		name: "source",
		label: "Source",
		type: "select",
		kind: "source",
		storage: "column",
		columnKey: "source",
		options: ["web", "referral", "ad", "manual", "other"],
		system: true,
	},
	{
		entityType: "lead",
		name: "assignedTo",
		label: "Assignee",
		type: "relation",
		kind: "assignee",
		storage: "column",
		columnKey: "assignedTo",
		system: true,
	},
	{
		entityType: "lead",
		name: "tags",
		label: "Tags",
		type: "multiselect",
		kind: "tags",
		storage: "join",
		system: true,
	},
];

const BUILT_IN_CONTACT_FIELDS: FieldDefinitionSeed[] = [
	{
		entityType: "contact",
		name: "personCode",
		label: "Person Code",
		type: "text",
		kind: "personCode",
		storage: "column",
		columnKey: "personCode",
		system: true,
		protected: true,
	},
	{
		entityType: "contact",
		name: "displayName",
		label: "Name",
		type: "text",
		kind: "displayName",
		storage: "column",
		columnKey: "displayName",
		system: true,
		protected: true,
	},
	{
		entityType: "contact",
		name: "email",
		label: "Email",
		type: "email",
		kind: "email",
		storage: "column",
		columnKey: "email",
		system: true,
	},
	{
		entityType: "contact",
		name: "phone",
		label: "Phone",
		type: "text",
		kind: "phone",
		storage: "column",
		columnKey: "phone",
		system: true,
	},
	{
		entityType: "contact",
		name: "companyId",
		label: "Company",
		type: "relation",
		kind: "company-ref",
		storage: "column",
		columnKey: "companyId",
		system: true,
	},
	{
		entityType: "contact",
		name: "assignedTo",
		label: "Assignee",
		type: "relation",
		kind: "assignee",
		storage: "column",
		columnKey: "assignedTo",
		system: true,
	},
	{
		entityType: "contact",
		name: "tags",
		label: "Tags",
		type: "multiselect",
		kind: "tags",
		storage: "join",
		system: true,
	},
];

const BUILT_IN_DEAL_FIELDS: FieldDefinitionSeed[] = [
	{
		entityType: "deal",
		name: "dealCode",
		label: "Deal Code",
		type: "text",
		kind: "entityCode",
		storage: "column",
		columnKey: "dealCode",
		system: true,
		protected: true,
	},
	{
		entityType: "deal",
		name: "title",
		label: "Title",
		type: "text",
		kind: "title",
		storage: "column",
		columnKey: "title",
		system: true,
		protected: true,
	},
	{
		entityType: "deal",
		name: "value",
		label: "Value",
		type: "number",
		kind: "currency",
		storage: "column",
		columnKey: "value",
		system: true,
	},
	{
		entityType: "deal",
		name: "currentStageId",
		label: "Stage",
		type: "select",
		kind: "stage",
		storage: "column",
		columnKey: "currentStageId",
		system: true,
		protected: true,
	},
	{
		entityType: "deal",
		name: "assignedTo",
		label: "Assignee",
		type: "relation",
		kind: "assignee",
		storage: "column",
		columnKey: "assignedTo",
		system: true,
	},
	{
		entityType: "deal",
		name: "tags",
		label: "Tags",
		type: "multiselect",
		kind: "tags",
		storage: "join",
		system: true,
	},
];

const BUILT_IN_COMPANY_FIELDS: FieldDefinitionSeed[] = [
	{
		entityType: "company",
		name: "companyCode",
		label: "Company Code",
		type: "text",
		kind: "entityCode",
		storage: "column",
		columnKey: "companyCode",
		system: true,
		protected: true,
	},
	{
		entityType: "company",
		name: "name",
		label: "Name",
		type: "text",
		kind: "displayName",
		storage: "column",
		columnKey: "name",
		system: true,
		protected: true,
	},
	{
		entityType: "company",
		name: "industry",
		label: "Industry",
		type: "text",
		kind: "text",
		storage: "column",
		columnKey: "industry",
		system: true,
	},
	{
		entityType: "company",
		name: "website",
		label: "Website",
		type: "url",
		kind: "url",
		storage: "column",
		columnKey: "website",
		system: true,
	},
	{
		entityType: "company",
		name: "assignedTo",
		label: "Assignee",
		type: "relation",
		kind: "assignee",
		storage: "column",
		columnKey: "assignees",
		system: true,
	},
	{
		entityType: "company",
		name: "tags",
		label: "Tags",
		type: "multiselect",
		kind: "tags",
		storage: "join",
		system: true,
	},
];

// ─── Industry overlays — extra fields per template ────────────────────────────
// Empty for now; future templates (real-estate, recruiting, …) push their
// industry-specific extras here. Returned together with the built-ins.
const INDUSTRY_OVERLAYS: Record<string, FieldDefinitionSeed[]> = {
	"real-estate": [
		{
			entityType: "lead",
			name: "propertyType",
			label: "Property Type",
			type: "select",
			kind: "select",
			storage: "fieldValues",
			options: ["Apartment", "House", "Land", "Commercial"],
		},
		{
			entityType: "lead",
			name: "budget",
			label: "Budget",
			type: "number",
			kind: "currency",
			storage: "fieldValues",
		},
	],
	recruiting: [
		{
			entityType: "lead",
			name: "skills",
			label: "Skills",
			type: "multiselect",
			kind: "multiselect",
			storage: "fieldValues",
		},
		{
			entityType: "lead",
			name: "yearsExperience",
			label: "Years of Experience",
			type: "number",
			kind: "number",
			storage: "fieldValues",
		},
		{
			entityType: "lead",
			name: "resume",
			label: "Resume",
			type: "file",
			kind: "file",
			storage: "fieldValues",
		},
	],
};

/**
 * Returns the full default field-definition set for an industry.
 * Built-ins always come first; industry overlays append after.
 */
export function getDefaultFieldDefinitions(industry: string): FieldDefinitionSeed[] {
	const builtIn = [
		...BUILT_IN_LEAD_FIELDS,
		...BUILT_IN_CONTACT_FIELDS,
		...BUILT_IN_DEAL_FIELDS,
		...BUILT_IN_COMPANY_FIELDS,
	];
	const overlay = INDUSTRY_OVERLAYS[industry] ?? [];
	return [...builtIn, ...overlay];
}
