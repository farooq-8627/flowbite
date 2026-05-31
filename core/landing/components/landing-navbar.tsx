"use client";

import { Menu, Orbit } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BRAND, NAV_LINKS } from "@/core/landing/lib/content";
import { ThemeToggle } from "./theme-toggle";

function BrandMark() {
	return (
		<Link href="#hero" className="flex items-center gap-2" aria-label={BRAND}>
			<span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-foreground">
				<Orbit className="size-5" />
			</span>
			<span className="font-semibold text-lg tracking-tight">{BRAND}</span>
		</Link>
	);
}

export function LandingNavbar() {
	const [open, setOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
				<BrandMark />

				<nav className="hidden items-center gap-1 lg:flex">
					{NAV_LINKS.map((link) => (
						<a
							key={link.href}
							href={link.href}
							className="rounded-[var(--radius)] px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
						>
							{link.label}
						</a>
					))}
				</nav>

				<div className="hidden items-center gap-2 lg:flex">
					<ThemeToggle />
					<Button variant="ghost" asChild>
						<Link href="/signin">Sign in</Link>
					</Button>
					<Button asChild>
						<Link href="/signup">Start free</Link>
					</Button>
				</div>

				<div className="flex items-center gap-1 lg:hidden">
					<ThemeToggle />
					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="Open menu">
								<Menu className="size-5" />
							</Button>
						</SheetTrigger>
						<SheetContent side="end" className="w-full gap-0 p-0 sm:max-w-sm">
							<div className="border-b p-4">
								<SheetTitle className="flex items-center gap-2">
									<span className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-foreground">
										<Orbit className="size-4" />
									</span>
									{BRAND}
								</SheetTitle>
							</div>
							<nav className="flex flex-col p-4">
								{NAV_LINKS.map((link) => (
									<a
										key={link.href}
										href={link.href}
										onClick={() => setOpen(false)}
										className="rounded-[var(--radius)] px-3 py-3 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
									>
										{link.label}
									</a>
								))}
							</nav>
							<div className="mt-auto grid gap-3 border-t p-4">
								<Button variant="outline" asChild>
									<Link href="/signin">Sign in</Link>
								</Button>
								<Button asChild>
									<Link href="/signup">Start free</Link>
								</Button>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
