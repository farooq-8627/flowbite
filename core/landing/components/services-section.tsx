import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SERVICES } from "@/core/landing/lib/content";
import { ICONS } from "@/core/landing/lib/icons";

export function ServicesSection() {
	return (
		<section id="services" className="scroll-mt-20 bg-muted/30 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						{SERVICES.badge}
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						{SERVICES.title}
					</h2>
					<p className="mt-4 text-pretty text-lg text-muted-foreground">
						{SERVICES.subtitle}
					</p>
				</div>

				<div className="mx-auto mt-16 grid max-w-6xl gap-6 lg:grid-cols-3">
					{SERVICES.cards.map((card) => {
						const Icon = ICONS[card.icon];
						return (
							<Card key={card.title} className="flex flex-col">
								<CardContent className="flex flex-1 flex-col space-y-4">
									<span className="flex size-11 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
										{Icon ? <Icon className="size-5" /> : null}
									</span>
									<div>
										<h3 className="font-semibold text-lg">{card.title}</h3>
										<p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
											{card.body}
										</p>
									</div>
									<ul className="mt-auto space-y-2 pt-2">
										{card.points.map((point) => (
											<li
												key={point}
												className="flex items-start gap-2 text-sm"
											>
												<Check className="mt-0.5 size-4 shrink-0 text-primary" />
												<span>{point}</span>
											</li>
										))}
									</ul>
								</CardContent>
							</Card>
						);
					})}
				</div>

				<div className="mt-12 text-center">
					<Button size="lg" asChild>
						<a href={SERVICES.cta.href}>
							{SERVICES.cta.label}
							<ArrowRight className="size-4" />
						</a>
					</Button>
				</div>
			</div>
		</section>
	);
}
