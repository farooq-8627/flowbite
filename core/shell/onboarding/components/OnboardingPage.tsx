"use client";

import { useMutation, useQuery } from "convex/react";
import { Briefcase, Building2, CheckCircle2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
	{ id: "workspace", label: "Workspace" },
	{ id: "industry", label: "Industry" },
	{ id: "complete", label: "Done" },
] as const;

const INDUSTRIES = [
	{ id: "dubai-real-estate", label: "Real Estate (Dubai / Gulf)" },
	{ id: "real-estate", label: "Real Estate" },
	{ id: "b2b-saas", label: "B2B SaaS" },
	{ id: "agency-freelance", label: "Agency / Freelance" },
	{ id: "recruiting", label: "Recruiting / Staffing" },
	{ id: "freelancer", label: "Freelancer / Solo" },
	{ id: "other", label: "Other" },
] as const;

const TEAM_SIZES = ["1–5", "6–20", "21–50", "51–200", "200+"] as const;

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
	return (
		<div className="absolute top-6 start-0 flex w-full justify-center gap-2">
			{STEPS.map((step, i) => (
				<div
					key={step.id}
					title={step.label}
					className={cn(
						"h-2 rounded-full transition-all duration-300",
						i === current
							? "w-6 bg-primary"
							: i < current
								? "w-2 bg-primary/60"
								: "w-2 bg-muted-foreground/30",
					)}
				/>
			))}
			<div className="absolute top-6 start-0 flex w-full justify-center">
				<p className="mt-4 text-muted-foreground text-xs">
					Step {current + 1} of {STEPS.length} — {STEPS[current]?.label}
				</p>
			</div>
		</div>
	);
}

// ─── Step 1: Workspace name + slug ────────────────────────────────────────────

function WorkspaceStep({ onNext }: { onNext: (orgId: Id<"orgs">, slug: string) => void }) {
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [loading, setLoading] = useState(false);

	const createOrg = useMutation(api.orgs.mutations.createOrg);
	const slugCheck = useQuery(api.orgs.queries.checkSlug, slug.length >= 2 ? { slug } : "skip");

	const handleNameChange = (v: string) => {
		setName(v);
		if (!slugEdited) {
			setSlug(
				v
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 48),
			);
		}
	};

	const slugTaken = slugCheck !== undefined && !slugCheck.available;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (slugTaken) return;
		setLoading(true);
		try {
			const result = await createOrg({ name: name.trim(), slug });
			onNext(result.orgId, result.slug);
		} catch (err) {
			toast.mutationError(err, "Failed to create workspace. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
			<div className="space-y-2 text-center">
				<h1 className="font-medium text-3xl">Name your workspace</h1>
				<p className="text-muted-foreground text-sm">
					This is how your team will identify your org.
				</p>
			</div>

			<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
				<Field className="gap-1.5">
					<FieldLabel htmlFor="org-name">Workspace Name</FieldLabel>
					<Input
						id="org-name"
						placeholder="Acme Corp"
						value={name}
						onChange={(e) => handleNameChange(e.target.value)}
						required
					/>
				</Field>

				<Field className="gap-1.5">
					<FieldLabel htmlFor="org-slug">URL Slug</FieldLabel>
					<div
						className={cn(
							"flex items-center rounded-[var(--radius)] border bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
							slugTaken && "border-destructive",
						)}
					>
						<span className="select-none border-e border-input px-3 py-2 text-muted-foreground text-sm">
							{APP_CONFIG.url.replace(/https?:\/\//, "")}/
						</span>
						<input
							id="org-slug"
							className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
							placeholder="acme-corp"
							value={slug}
							onChange={(e) => {
								setSlugEdited(true);
								setSlug(
									e.target.value
										.toLowerCase()
										.replace(/[^a-z0-9-]/g, "")
										.slice(0, 48),
								);
							}}
							required
						/>
					</div>
					{slugTaken && (
						<p className="text-destructive text-xs">
							This slug is taken. Try <strong>{slug}-2</strong> or choose another.
						</p>
					)}
					{slugCheck?.available && slug.length >= 2 && (
						<p className="text-xs text-green-600 dark:text-green-400">✓ Available</p>
					)}
				</Field>

				<Button
					className="w-full"
					type="submit"
					disabled={loading || !name || !slug || slugTaken}
				>
					{loading ? "Creating…" : "Continue"}
				</Button>
			</form>
		</div>
	);
}

// ─── Step 2: Industry + team size ─────────────────────────────────────────────

function IndustryStep({
	orgId,
	onNext,
	onBack,
}: {
	orgId: Id<"orgs">;
	onNext: () => void;
	onBack: () => void;
}) {
	const [industry, setIndustry] = useState<string | null>(null);
	const [teamSize, setTeamSize] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const updateOrgIndustry = useMutation(api.orgs.mutations.updateOrgIndustry);
	const templates = useQuery(api.crm.fields.templates.queries.list, {});
	const templatesById = new Map((templates ?? []).map((t) => [t.id, t] as const));

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!industry || !teamSize) return;
		setLoading(true);
		try {
			await updateOrgIndustry({ orgId, industry, teamSize });
			onNext();
		} catch (err) {
			toast.mutationError(err, "Failed to save industry. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[440px]">
			<div className="space-y-2 text-center">
				<h1 className="font-medium text-3xl">About your business</h1>
				<p className="text-muted-foreground text-sm">
					Pick what fits — we'll seed your pipeline, fields, tags, and AI persona.
				</p>
			</div>

			<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<p className="text-sm font-medium">Industry</p>
					<div className="grid grid-cols-2 gap-2">
						{INDUSTRIES.map((item) => {
							const t = templatesById.get(item.id);
							const isSelected = industry === item.id;
							const isCurated = !!t;
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => setIndustry(item.id)}
									className={cn(
										"flex flex-col gap-1 rounded-[var(--radius)] border px-3 py-2 text-start text-sm transition-colors",
										isSelected
											? "border-primary bg-primary/10 font-medium text-primary"
											: "border-border bg-background hover:bg-muted",
										isCurated && "min-h-[68px]",
									)}
								>
									<span className="flex items-center gap-1.5">
										{t?.icon && <span aria-hidden="true">{t.icon}</span>}
										<span className="truncate">{item.label}</span>
									</span>
									{isCurated && t.description && (
										<span
											className={cn(
												"line-clamp-2 font-normal text-[11px] leading-snug",
												isSelected
													? "text-primary/80"
													: "text-muted-foreground",
											)}
										>
											{t.description}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-sm font-medium">Team size</p>
					<div className="flex flex-wrap gap-2">
						{TEAM_SIZES.map((size) => (
							<button
								key={size}
								type="button"
								onClick={() => setTeamSize(size)}
								className={cn(
									"rounded-full border px-4 py-1.5 text-sm transition-colors",
									teamSize === size
										? "border-primary bg-primary/10 font-medium text-primary"
										: "border-border bg-background hover:bg-muted",
								)}
							>
								{size}
							</button>
						))}
					</div>
				</div>

				<div className="flex gap-3">
					<Button type="button" variant="outline" className="flex-1" onClick={onBack}>
						Back
					</Button>
					<Button
						className="flex-1"
						type="submit"
						disabled={!industry || !teamSize || loading}
					>
						{loading ? "Saving…" : "Continue"}
					</Button>
				</div>
			</form>
		</div>
	);
}

// ─── Step 3: Complete ─────────────────────────────────────────────────────────

function CompleteStep({ orgId, onBack }: { orgId: Id<"orgs">; onBack: () => void }) {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const markComplete = useMutation(api.orgs.mutations.markOnboardingComplete);

	const handleLaunch = async () => {
		setLoading(true);
		try {
			const { slug } = await markComplete({ orgId });
			router.push(`/${slug}`);
		} catch (err) {
			toast.mutationError(err, "Failed to complete setup. Please try again.");
			setLoading(false);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col items-center justify-center space-y-8 sm:w-[350px]">
			<div className="flex flex-col items-center space-y-4 text-center">
				<div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
					<CheckCircle2 className="size-8 text-primary" />
				</div>
				<div className="space-y-2">
					<h1 className="font-medium text-3xl">Workspace ready!</h1>
					<p className="text-muted-foreground text-sm">
						Everything is set up. Let&apos;s take you to your dashboard.
					</p>
				</div>
			</div>

			<div className="w-full space-y-2">
				{["Workspace created", "Industry configured", "Default pipeline ready"].map(
					(label) => (
						<div
							key={label}
							className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-muted/40 px-4 py-2.5"
						>
							<span className="font-bold text-primary">✓</span>
							<span className="text-sm">{label}</span>
						</div>
					),
				)}
			</div>

			<div className="flex w-full gap-3">
				<Button
					type="button"
					variant="outline"
					className="flex-1"
					onClick={onBack}
					disabled={loading}
				>
					Back
				</Button>
				<Button className="flex-1" onClick={handleLaunch} disabled={loading}>
					{loading ? "Launching…" : "Go to Dashboard →"}
				</Button>
			</div>
		</div>
	);
}

// ─── Panel configs per step ───────────────────────────────────────────────────

const PANELS = [
	{
		icon: <Building2 className="size-10" />,
		title: APP_CONFIG.name,
		tagline: APP_CONFIG.description,
		bottomLeft: {
			heading: "Your workspace, your rules",
			body: "Rename modules, set pipelines, and customise everything.",
		},
		bottomRight: {
			heading: "Invite your team",
			body: "Add members after setup — roles and permissions included.",
		},
	},
	{
		icon: <Briefcase className="size-10" />,
		title: "Tell us about your business",
		tagline: "We'll tailor the platform to your industry.",
		bottomLeft: {
			heading: "Industry templates",
			body: "Pre-built pipelines and fields for your sector.",
		},
		bottomRight: { heading: "Scales with you", body: "From solo founder to 500-person team." },
	},
	{
		icon: <Rocket className="size-10" />,
		title: "You're all set!",
		tagline: "Your workspace is ready to launch.",
		bottomLeft: {
			heading: "What's next?",
			body: "Add your first lead, invite your team, and start closing deals.",
		},
		bottomRight: {
			heading: "Need a hand?",
			body: "Our onboarding guide walks you through every feature.",
		},
	},
];

// ─── Main OnboardingPage ──────────────────────────────────────────────────────

/**
 * Single-page onboarding wizard. All 3 steps live here — no sub-routes.
 * State: step index + orgId (set after step 1 creates the org).
 */
export function OnboardingPage() {
	const [step, setStep] = useState(0);
	const [orgId, setOrgId] = useState<Id<"orgs"> | null>(null);

	const panel = PANELS[step]!;

	return (
		<AuthShellLayout panel={panel}>
			{/* Step dots */}
			<StepDots current={step} />

			{/* Step content */}
			<div className="flex h-full w-full items-center justify-center pt-16">
				{step === 0 && (
					<WorkspaceStep
						onNext={(id, _slug) => {
							setOrgId(id);
							setStep(1);
						}}
					/>
				)}
				{step === 1 && orgId && (
					<IndustryStep
						orgId={orgId}
						onNext={() => setStep(2)}
						onBack={() => setStep(0)}
					/>
				)}
				{step === 2 && orgId && <CompleteStep orgId={orgId} onBack={() => setStep(1)} />}
			</div>
		</AuthShellLayout>
	);
}
