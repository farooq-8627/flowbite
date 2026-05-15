"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { getPermissionModules } from "../../../config/permissions-catalog";
import { useSettingsForm } from "../../../hooks/useSettingsForm";

type Role = Doc<"orgRoles">;

const ROLE_COLORS = [
	"#64748b",
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#14b8a6",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
];

const roleMetaSchema = z.object({
	name: z.string().min(1, "Name is required").max(40, "Name is too long"),
	description: z.string().max(200).optional(),
	color: z.string().optional(),
});

type RoleMetaInput = z.infer<typeof roleMetaSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Permission checkbox grid
// ────────────────────────────────────────────────────────────────────────────

function PermissionMatrix({
	selected,
	onChange,
	disabled,
}: {
	selected: Set<string>;
	onChange: (next: Set<string>) => void;
	disabled?: boolean;
}) {
	// Labels are reactive via useEntityLabels — rename "Lead" → "Inquiry" in
	// Settings and this matrix shows "View inquiries", "Create inquiries", etc.
	// instantly. Permission keys (leads.view, etc.) are the backend contract
	// and never change.
	const labels = useEntityLabels();
	const modules = useMemo(() => getPermissionModules(labels), [labels]);

	const toggleKey = (key: string) => {
		if (disabled) return;
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		onChange(next);
	};

	const toggleModule = (keys: readonly string[], checked: boolean) => {
		if (disabled) return;
		const next = new Set(selected);
		if (checked) {
			for (const k of keys) next.add(k);
		} else {
			for (const k of keys) next.delete(k);
		}
		onChange(next);
	};

	return (
		<ScrollArea className="h-72 rounded-[var(--radius)] border">
			<div className="divide-y divide-border">
				{modules.map((mod) => {
					const moduleKeys = mod.permissions.map((p) => p.key);
					const allSelected = moduleKeys.every((k) => selected.has(k));
					const someSelected = moduleKeys.some((k) => selected.has(k));

					return (
						<div key={mod.id} className="px-4 py-3">
							<div className="flex items-start justify-between gap-4 pb-2">
								<div className="min-w-0">
									<div className="text-sm font-medium">{mod.label}</div>
									{mod.description && (
										<p className="text-xs text-muted-foreground">
											{mod.description}
										</p>
									)}
								</div>
								<div className="flex items-center gap-2">
									<span className="text-[11px] text-muted-foreground tabular-nums">
										{moduleKeys.filter((k) => selected.has(k)).length} /{" "}
										{moduleKeys.length}
									</span>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-6 text-xs"
										onClick={() => toggleModule(moduleKeys, !allSelected)}
										disabled={disabled}
									>
										{allSelected
											? "Deselect all"
											: someSelected
												? "Select all"
												: "Select all"}
									</Button>
								</div>
							</div>
							<div className="grid gap-1.5 sm:grid-cols-2">
								{mod.permissions.map((p) => {
									// Each permission row has an explicit id so the <label>
									// can bind to the Checkbox via htmlFor — keeps screen
									// readers happy and satisfies biome/a11y.
									const inputId = `perm-${p.key}`;
									return (
										<label
											key={p.key}
											htmlFor={inputId}
											className="flex cursor-pointer items-start gap-2 rounded-[var(--radius)] px-2 py-1.5 hover:bg-muted/50"
										>
											<Checkbox
												id={inputId}
												checked={selected.has(p.key)}
												onCheckedChange={() => toggleKey(p.key)}
												disabled={disabled}
												className="mt-0.5"
											/>
											<div className="min-w-0">
												<div className="text-xs font-medium">{p.label}</div>
												{p.description && (
													<div className="text-[11px] leading-tight text-muted-foreground">
														{p.description}
													</div>
												)}
											</div>
										</label>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</ScrollArea>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Role editor dialog (edit existing role)
// ────────────────────────────────────────────────────────────────────────────

export function RoleEditorDialog({
	role,
	open,
	onOpenChange,
}: {
	role: Role;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const update = useMutation(api.orgRoles.mutations.update);
	const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissions));

	// Keep permission set in sync if the role prop changes (e.g. another user
	// edits it). useEffect — not useMemo — because we're intentionally doing a
	// side-effect (setState) rather than memoising a derived value.
	useEffect(() => {
		setSelected(new Set(role.permissions));
	}, [role.permissions]);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: roleMetaSchema,
		values: {
			name: role.name,
			description: role.description ?? "",
			color: role.color ?? "",
		},
		onSubmit: async (data: RoleMetaInput) => {
			try {
				await update({
					roleId: role._id,
					name: role.isSystem ? undefined : data.name, // system roles can't rename
					description: data.description || undefined,
					color: data.color || undefined,
					permissions: Array.from(selected),
				});
				toast.success(`Role "${role.name}" updated`);
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to save role");
			}
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Edit role: {role.name}
						{role.isSystem && (
							<Badge variant="secondary" className="text-[10px]">
								System
							</Badge>
						)}
					</DialogTitle>
					<DialogDescription>
						{role.isSystem
							? "System role name can't be changed, but permissions can be customised."
							: "Rename, describe, and choose which actions this role can perform."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-[1fr,auto]">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input {...field} disabled={role.isSystem} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="color"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Color</FormLabel>
										<FormControl>
											<div className="flex h-9 items-center gap-1">
												{ROLE_COLORS.map((c) => (
													<button
														key={c}
														type="button"
														aria-label={`Color ${c}`}
														onClick={() => field.onChange(c)}
														className="size-5 rounded-full ring-offset-1 transition-all hover:scale-110"
														style={{
															backgroundColor: c,
															outline:
																field.value === c
																	? "2px solid var(--ring)"
																	: undefined,
														}}
													/>
												))}
											</div>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Input placeholder="What this role is for" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div>
							<Label className="text-sm">Permissions</Label>
							<p className="mb-2 text-xs text-muted-foreground">
								Select every action members with this role can perform.
							</p>
							<PermissionMatrix selected={selected} onChange={setSelected} />
							<p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
								{selected.size} permissions selected
							</p>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" size="sm" disabled={isSubmitting}>
								Save role
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Create role dialog (new custom role)
// ────────────────────────────────────────────────────────────────────────────

export function CreateRoleDialog({
	orgId,
	open,
	onOpenChange,
	defaultPermissions = [],
}: {
	orgId: Id<"orgs">;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	defaultPermissions?: string[];
}) {
	const create = useMutation(api.orgRoles.mutations.create);
	const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultPermissions));

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: roleMetaSchema,
		values: { name: "", description: "", color: ROLE_COLORS[0] },
		onSubmit: async (data: RoleMetaInput) => {
			try {
				await create({
					orgId,
					name: data.name,
					description: data.description || undefined,
					color: data.color || undefined,
					permissions: Array.from(selected),
				});
				toast.success(`Created role "${data.name}"`);
				form.reset({ name: "", description: "", color: ROLE_COLORS[0] });
				setSelected(new Set());
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to create role");
			}
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Create a custom role</DialogTitle>
					<DialogDescription>
						Custom roles sit alongside the built-in Owner, Admin, Member, and Viewer
						roles.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-[1fr,auto]">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="e.g. Sales Manager" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="color"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Color</FormLabel>
										<FormControl>
											<div className="flex h-9 items-center gap-1">
												{ROLE_COLORS.map((c) => (
													<button
														key={c}
														type="button"
														aria-label={`Color ${c}`}
														onClick={() => field.onChange(c)}
														className="size-5 rounded-full ring-offset-1 transition-all hover:scale-110"
														style={{
															backgroundColor: c,
															outline:
																field.value === c
																	? "2px solid var(--ring)"
																	: undefined,
														}}
													/>
												))}
											</div>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Input placeholder="What this role is for" {...field} />
									</FormControl>
								</FormItem>
							)}
						/>
						<div>
							<Label className="text-sm">Permissions</Label>
							<p className="mb-2 text-xs text-muted-foreground">
								Select which actions this role can perform.
							</p>
							<PermissionMatrix selected={selected} onChange={setSelected} />
							<p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
								{selected.size} permissions selected
							</p>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={isSubmitting || selected.size === 0}
							>
								Create role
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
