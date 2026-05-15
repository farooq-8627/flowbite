import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@/config/app-config";

export interface AuthShellPanelProps {
	/** Icon shown top-left of the right panel */
	icon?: ReactNode;
	/** App name shown top-left */
	title?: string;
	/** Tagline shown below title */
	tagline?: string;
	/** Bottom-left block: heading + body */
	bottomLeft?: { heading: string; body: string };
	/** Bottom-right block: heading + body */
	bottomRight?: { heading: string; body: string };
	/** Replaces the entire right panel content (for onboarding custom panels) */
	rightPanel?: ReactNode;
}

interface AuthShellLayoutProps {
	children: ReactNode;
	panel?: AuthShellPanelProps;
}

/**
 * Shared split-screen layout for auth pages and onboarding.
 * Left: form area. Right: branded panel (customisable via props).
 */
export function AuthShellLayout({ children, panel }: AuthShellLayoutProps) {
	return (
		<main>
			<div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
				{/* Right: branded panel */}
				<div className="relative order-2 hidden h-full rounded-[var(--radius)] bg-primary lg:flex">
					{panel?.rightPanel ? (
						panel.rightPanel
					) : (
						<>
							<div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
								{panel?.icon && <div className="mb-1">{panel.icon}</div>}
								<h1 className="font-medium text-2xl">
									{panel?.title ?? APP_CONFIG.name}
								</h1>
								<p className="text-sm opacity-80">
									{panel?.tagline ?? APP_CONFIG.description}
								</p>
							</div>

							<div className="absolute bottom-10 flex w-full justify-between px-10">
								<div className="flex-1 space-y-1 text-primary-foreground">
									<h2 className="font-medium">
										{panel?.bottomLeft?.heading ?? "Built for your team"}
									</h2>
									<p className="text-sm opacity-80">
										{panel?.bottomLeft?.body ??
											"Manage leads, contacts, and deals in one place."}
									</p>
								</div>
								<Separator
									orientation="vertical"
									className="mx-3 h-auto opacity-30"
								/>
								<div className="flex-1 space-y-1 text-primary-foreground">
									<h2 className="font-medium">
										{panel?.bottomRight?.heading ?? "Need help?"}
									</h2>
									<p className="text-sm opacity-80">
										{panel?.bottomRight?.body ??
											"Reach out to support — we're here for you."}
									</p>
								</div>
							</div>
						</>
					)}
				</div>

				{/* Left: form */}
				<div className="relative order-1 flex h-full">{children}</div>
			</div>
		</main>
	);
}
