"use client";

/**
 * TypedDeleteDialog — GitHub-style "type the key to confirm" delete prompt.
 *
 * Per L8 of INDUSTRY-TEMPLATES-DB-MIGRATION.md, hard-deleting a template
 * (built-in or custom) requires the operator to TYPE the exact templateKey
 * into the confirmation field. The server-side mutation also re-checks
 * `confirmKey === templateKey` and rejects with `TYPED_CONFIRM_MISMATCH`
 * — defence-in-depth.
 *
 * Built-in templates additionally surface a yellow warning banner. Templates
 * that are currently in use by ≥1 org disable the confirm button locally
 * (the server still rejects with `TEMPLATE_IN_USE`).
 *
 * Spec: §5.3 (TypedDeleteDialog row), §5.4 (deleteTemplate mutation).
 */

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TypedDeleteDialog({
	templateKey,
	isBuiltIn,
	orgsInUse,
	onConfirm,
}: {
	templateKey: string;
	isBuiltIn: boolean;
	orgsInUse: number;
	onConfirm: (confirmKey: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);

	const matches = typed.trim() === templateKey;
	const blockedByUsage = orgsInUse > 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setTyped("");
			}}
		>
			<DialogTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="text-destructive hover:text-destructive"
					aria-label="Delete template"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete template?</DialogTitle>
					<DialogDescription>
						This permanently removes the row from the database. New onboardings stop
						seeing this template immediately. Existing orgs already on it are
						unaffected.
					</DialogDescription>
				</DialogHeader>

				{isBuiltIn ? (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>This is a built-in template</AlertTitle>
						<AlertDescription>
							It was seeded by the platform's first migration. Deleting cannot be
							undone — re-seeding requires running a migration.
						</AlertDescription>
					</Alert>
				) : null}

				{blockedByUsage ? (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Currently in use by {orgsInUse} org(s)</AlertTitle>
						<AlertDescription>
							The server will reject this delete with <code>TEMPLATE_IN_USE</code>.
							Move those orgs onto another template first, or use{" "}
							<strong>Archive</strong> to hide it from new onboardings while keeping
							the data.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="grid gap-2">
					<Label className="text-xs">
						Type{" "}
						<code className="rounded-[var(--radius)] bg-muted px-1 py-0.5 font-mono text-xs">
							{templateKey}
						</code>{" "}
						to confirm
					</Label>
					<Input
						autoFocus
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						placeholder={templateKey}
						className="font-mono"
						autoComplete="off"
					/>
				</div>

				<DialogFooter className="gap-2 sm:gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						variant="destructive"
						disabled={!matches || busy || blockedByUsage}
						onClick={async () => {
							setBusy(true);
							try {
								await onConfirm(typed.trim());
								setOpen(false);
								setTyped("");
							} catch {
								// Toast surfaced by caller; keep dialog open.
							} finally {
								setBusy(false);
							}
						}}
					>
						{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
						Delete forever
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
