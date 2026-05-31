import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FEATURES } from "@/core/landing/lib/content";
import { ICONS } from "@/core/landing/lib/icons";

export function FeaturesSection() {
	return (
		<section id="features" className="scroll-mt-20 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						Features
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						A CRM built for the AI era — not the form-and-click era
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						Reactive, proactive, analytical, autonomous, and creative. Everything below
						ships today.
					</p>
				</div>

				<div className="mx-auto mt-16 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((feature) => {
						const Icon = ICONS[feature.icon];
						return (
							<Card key={feature.title} className="transition-shadow hover:shadow-md">
								<CardContent className="space-y-3">
									<span className="flex size-11 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
										{Icon ? <Icon className="size-5" /> : null}
									</span>
									<h3 className="font-semibold text-lg">{feature.title}</h3>
									<p className="text-muted-foreground text-sm leading-relaxed">
										{feature.description}
									</p>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		</section>
	);
}
