import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FAQS } from "@/core/landing/lib/content";

export function FaqSection() {
	return (
		<section id="faq" className="scroll-mt-20 bg-muted/30 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						FAQ
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						Frequently asked questions
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						Everything you need to know. Still curious? Reach us through the contact
						form below.
					</p>
				</div>

				<div className="mx-auto mt-16 max-w-3xl">
					<Accordion type="single" collapsible className="w-full">
						{FAQS.map((faq, index) => (
							<AccordionItem key={faq.q} value={`item-${index}`}>
								<AccordionTrigger className="text-start font-medium text-base">
									{faq.q}
								</AccordionTrigger>
								<AccordionContent className="text-muted-foreground leading-relaxed">
									{faq.a}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
