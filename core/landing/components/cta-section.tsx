import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DotPattern } from "./dot-pattern";

export function CtaSection() {
	return (
		<section className="py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="relative mx-auto max-w-5xl overflow-hidden rounded-[calc(var(--radius)+8px)] border bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
					<DotPattern className="opacity-20" />
					<div className="relative">
						<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl lg:text-5xl">
							Spend less time on admin. More time on selling.
						</h2>
						<p className="mx-auto mt-4 max-w-xl text-pretty text-primary-foreground/80 text-lg">
							Get started in minutes. Free Pro for early users — no credit card
							required.
						</p>
						<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
							<Button size="lg" variant="secondary" className="text-base" asChild>
								<Link href="/signup">
									Start free
									<ArrowRight className="size-4" />
								</Link>
							</Button>
							<Button
								size="lg"
								variant="outline"
								className="border-primary-foreground/30 bg-transparent text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
								asChild
							>
								<a href="#contact">Talk to us</a>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
