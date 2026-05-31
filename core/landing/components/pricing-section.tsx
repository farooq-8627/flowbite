"use client";

import { useQuery } from "convex/react";
import { Check } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * Pricing — DB-driven. Reads the platform-owner-managed tiers via the public
 * `listPublicTiers` query (same SSOT the in-app billing + owner panel use), so
 * editing prices/copy/display names in the owner panel updates the landing.
 */
export function PricingSection() {
	const tiers = useQuery(api._platform.tiers.queries.listPublicTiers, {});

	return (
		<section id="pricing" className="scroll-mt-20 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						Pricing
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						Start free. Upgrade when it pays for itself.
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						Bring your own AI key on every plan. Early users get Pro free for 90 days —
						no credit card.
					</p>
				</div>

				<div className="mx-auto mt-16 grid max-w-6xl gap-6 lg:grid-cols-4">
					{tiers === undefined
						? [0, 1, 2, 3].map((i) => (
								<Card key={i} className="flex flex-col">
									<CardContent className="space-y-5">
										<Skeleton className="h-5 w-24" />
										<Skeleton className="h-10 w-32" />
										<Skeleton className="h-9 w-full" />
										<div className="space-y-2">
											<Skeleton className="h-4 w-full" />
											<Skeleton className="h-4 w-5/6" />
											<Skeleton className="h-4 w-4/6" />
										</div>
									</CardContent>
								</Card>
							))
						: tiers.map((tier) => {
								const isEnterprise = tier.key === "enterprise";
								const isFree = tier.monthlyPriceUSD === 0;
								const cta = isEnterprise
									? { label: "Contact us", href: "#contact" }
									: {
											label: isFree
												? "Get started"
												: `Choose ${tier.displayName}`,
											href: "/signup",
										};
								return (
									<Card
										key={tier.key}
										className={cn(
											"relative flex flex-col",
											tier.highlight &&
												"border-primary shadow-lg ring-1 ring-primary/20",
										)}
									>
										{tier.highlight && (
											<Badge className="-top-3 absolute start-1/2 -translate-x-1/2">
												Most popular
											</Badge>
										)}
										<CardContent className="flex flex-1 flex-col space-y-5">
											<div>
												<h3 className="font-semibold text-lg">
													{tier.displayName}
												</h3>
												<p className="mt-1 min-h-10 text-muted-foreground text-sm">
													{tier.description}
												</p>
											</div>
											<div>
												<div className="font-bold text-4xl tracking-tight">
													{isEnterprise
														? "Custom"
														: isFree
															? "$0"
															: `$${tier.monthlyPriceUSD}`}
												</div>
												<div className="mt-1 text-muted-foreground text-sm">
													{isEnterprise
														? "talk to us"
														: isFree
															? "forever"
															: "per month"}
												</div>
											</div>
											<Button
												asChild
												variant={tier.highlight ? "default" : "outline"}
												className="w-full"
											>
												<Link href={cta.href}>{cta.label}</Link>
											</Button>
											<ul className="space-y-2.5 pt-1 text-sm">
												{tier.features.map((feature) => (
													<li
														key={feature}
														className="flex items-start gap-2.5"
													>
														<Check className="mt-0.5 size-4 shrink-0 text-primary" />
														<span className="text-muted-foreground">
															{feature}
														</span>
													</li>
												))}
											</ul>
										</CardContent>
									</Card>
								);
							})}
				</div>
			</div>
		</section>
	);
}
