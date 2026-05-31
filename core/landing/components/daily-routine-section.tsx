import { Badge } from "@/components/ui/badge";
import { ROUTINE } from "@/core/landing/lib/content";

export function DailyRoutineSection() {
	return (
		<section id="routine" className="scroll-mt-20 bg-muted/30 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						How it works
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						Your day, augmented
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						From the morning briefing to tomorrow's plan — here's a day with your CRM
						doing the busywork.
					</p>
				</div>

				<ol className="mx-auto mt-16 max-w-3xl">
					{ROUTINE.map((step, index) => (
						<li key={step.time} className="relative flex gap-6 pb-10 last:pb-0">
							{/* Timeline rail */}
							<div className="flex flex-col items-center">
								<span className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-background font-semibold text-primary text-sm">
									{index + 1}
								</span>
								{index < ROUTINE.length - 1 && (
									<span className="mt-1 w-px flex-1 bg-border" />
								)}
							</div>
							<div className="pt-1">
								<div className="font-medium text-muted-foreground text-sm">
									{step.time}
								</div>
								<h3 className="mt-1 font-semibold text-lg">{step.title}</h3>
								<p className="mt-1 text-pretty text-muted-foreground">
									{step.body}
								</p>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
