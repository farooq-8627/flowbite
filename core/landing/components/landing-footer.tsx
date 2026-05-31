import { Orbit } from "lucide-react";
import { BRAND, FOOTER } from "@/core/landing/lib/content";

export function LandingFooter() {
	const year = new Date().getFullYear();
	return (
		<footer className="border-t bg-muted/30">
			<div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
				<div className="grid gap-10 lg:grid-cols-5">
					<div className="lg:col-span-2">
						<div className="flex items-center gap-2">
							<span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-foreground">
								<Orbit className="size-5" />
							</span>
							<span className="font-semibold text-lg tracking-tight">{BRAND}</span>
						</div>
						<p className="mt-4 max-w-xs text-pretty text-muted-foreground text-sm">
							{FOOTER.tagline}
						</p>
					</div>

					{FOOTER.columns.map((column) => (
						<div key={column.title}>
							<h3 className="font-semibold text-sm">{column.title}</h3>
							<ul className="mt-4 space-y-2.5">
								{column.links.map((link) => (
									<li key={link.label}>
										<a
											href={link.href}
											className="text-muted-foreground text-sm transition-colors hover:text-foreground"
										>
											{link.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="mt-12 border-t pt-8 text-center text-muted-foreground text-sm">
					© {year} {BRAND}. All rights reserved.
				</div>
			</div>
		</footer>
	);
}
