import { ArrowRight, Calendar, Check, NotebookPen, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HERO } from "@/core/landing/lib/content";
import { DotPattern } from "./dot-pattern";

const PROPOSED_ACTIONS = [
	{ icon: UserPlus, label: "Create lead", value: "Sara Khan" },
	{ icon: Calendar, label: "Schedule follow-up", value: "Next Tuesday, 3:00 PM" },
	{ icon: NotebookPen, label: "Add note", value: "Pricing concern raised" },
];

export function HeroSection() {
	return (
		<section id="hero" className="relative overflow-hidden pt-16 pb-20 sm:pt-24">
			<DotPattern />
			<div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<Badge variant="outline" className="mb-6 gap-2 px-3 py-1.5">
						<Sparkles className="size-3.5" />
						{HERO.badge}
					</Badge>

					<h1 className="text-balance font-bold text-4xl tracking-tight sm:text-6xl lg:text-7xl">
						{HERO.titleLead}{" "}
						<span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
							{HERO.titleAccent}
						</span>
						.
					</h1>

					<p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
						{HERO.subtitle}
					</p>

					<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
						<Button size="lg" className="text-base" asChild>
							<Link href={HERO.primaryCta.href}>
								{HERO.primaryCta.label}
								<ArrowRight className="size-4" />
							</Link>
						</Button>
						<Button size="lg" variant="outline" className="text-base" asChild>
							<a href={HERO.secondaryCta.href}>{HERO.secondaryCta.label}</a>
						</Button>
					</div>

					<div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
						{HERO.trust.map((item) => (
							<span key={item} className="flex items-center gap-1.5">
								<Check className="size-4 text-primary" />
								{item}
							</span>
						))}
					</div>
				</div>

				{/* Product mock — the propose/approve loop, no screenshot needed. */}
				<div className="relative mx-auto mt-16 max-w-2xl">
					<div className="-top-10 absolute start-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
					<div className="relative overflow-hidden rounded-[calc(var(--radius)+6px)] border bg-card shadow-2xl">
						<div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
							<span className="size-3 rounded-full bg-destructive/60" />
							<span className="size-3 rounded-full bg-yellow-500/60" />
							<span className="size-3 rounded-full bg-green-500/60" />
							<span className="ms-2 text-muted-foreground text-xs">
								{HERO.titleLead} {HERO.titleAccent}
							</span>
						</div>
						<div className="space-y-4 p-5">
							{/* User message */}
							<div className="flex justify-end">
								<p className="max-w-[85%] rounded-[var(--radius)] bg-primary px-4 py-2.5 text-primary-foreground text-sm">
									{HERO.example}
								</p>
							</div>
							{/* AI propose card */}
							<div className="rounded-[var(--radius)] border bg-background p-4">
								<div className="mb-3 flex items-center gap-2 text-muted-foreground text-xs">
									<Sparkles className="size-3.5 text-primary" />
									Proposed — review before it runs
								</div>
								<ul className="space-y-2.5">
									{PROPOSED_ACTIONS.map((action) => (
										<li
											key={action.label}
											className="flex items-center gap-3 text-sm"
										>
											<span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
												<action.icon className="size-4" />
											</span>
											<span className="text-muted-foreground">
												{action.label}:
											</span>
											<span className="font-medium">{action.value}</span>
										</li>
									))}
								</ul>
								<div className="mt-4 flex gap-2">
									<Button size="sm" className="flex-1">
										<Check className="size-4" />
										Approve
									</Button>
									<Button size="sm" variant="outline" className="flex-1">
										Edit
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
