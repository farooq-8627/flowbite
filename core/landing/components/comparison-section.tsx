import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COMPARE } from "@/core/landing/lib/content";
import { cn } from "@/lib/utils";

function Cell({ value, highlight }: { value: string; highlight: boolean }) {
	if (value === "Yes") {
		return (
			<Check
				className={cn("mx-auto size-5", highlight ? "text-primary" : "text-foreground")}
			/>
		);
	}
	if (value === "No") {
		return <X className="mx-auto size-5 text-muted-foreground/50" />;
	}
	return (
		<span
			className={cn(
				"text-sm",
				highlight ? "font-semibold text-foreground" : "text-muted-foreground",
			)}
		>
			{value}
		</span>
	);
}

export function ComparisonSection() {
	const { columns, rows } = COMPARE;
	return (
		<section id="compare" className="scroll-mt-20 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl text-center">
					<Badge variant="outline" className="mb-4">
						Compare
					</Badge>
					<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						How we stack up
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						An honest look. Other CRMs are great at what they do — we're built
						chat-first from the ground up.
					</p>
				</div>

				<div className="mx-auto mt-16 max-w-5xl overflow-x-auto">
					<table className="w-full border-collapse">
						<thead>
							<tr>
								<th className="w-1/3 p-4 text-start font-medium text-muted-foreground text-sm" />
								{columns.map((col, i) => (
									<th
										key={col}
										className={cn(
											"p-4 text-center font-semibold",
											i === 0 &&
												"rounded-t-[var(--radius)] bg-primary/10 text-primary",
										)}
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.label} className="border-t">
									<td className="p-4 text-start font-medium text-sm">
										{row.label}
									</td>
									{row.values.map((value, i) => (
										<td
											key={`${row.label}-${columns[i + 1] ?? i}`}
											className={cn(
												"p-4 text-center",
												i === 0 && "bg-primary/5",
											)}
										>
											<Cell value={value} highlight={i === 0} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
