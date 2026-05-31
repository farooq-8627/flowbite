import { BUILT_WITH, STATS } from "@/core/landing/lib/content";

export function LogosSection() {
	return (
		<section className="border-y bg-muted/30 py-12">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<p className="text-center text-muted-foreground text-sm">
					Built on a modern, trusted stack
				</p>
				<div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
					{BUILT_WITH.map((name) => (
						<span key={name} className="font-semibold text-lg text-muted-foreground/70">
							{name}
						</span>
					))}
				</div>

				<div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
					{STATS.map((stat) => (
						<div key={stat.label} className="text-center">
							<div className="font-bold text-3xl tracking-tight sm:text-4xl">
								{stat.value}
							</div>
							<div className="mt-1 text-muted-foreground text-sm">{stat.label}</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
