import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AuthShellLayout, type AuthShellPanelProps } from "@/core/auth/layouts/AuthShellLayout";

export interface OnboardingStep {
  id: string;
  label: string;
}

interface OnboardingLayoutProps {
  children: ReactNode;
  /** All steps in the flow */
  steps: readonly OnboardingStep[];
  /** Index (0-based) of the current step */
  currentStep: number;
  /** Right panel customisation — passed through to AuthShellLayout */
  panel?: AuthShellPanelProps;
}

/**
 * Onboarding layout — same split-screen as auth but with step progress dots.
 * Right panel changes per step via the `panel` prop.
 */
export function OnboardingLayout({ children, steps, currentStep, panel }: OnboardingLayoutProps) {
  return (
    <AuthShellLayout panel={panel}>
      {/* Step dots — top-center */}
      <div className="absolute top-6 left-0 flex w-full justify-center gap-2">
        {steps.map((step, i) => (
          <div
            key={step.id}
            title={step.label}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === currentStep
                ? "w-6 bg-primary"
                : i < currentStep
                  ? "w-2 bg-primary/60"
                  : "w-2 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>

      {/* Step label */}
      <div className="absolute top-12 left-0 flex w-full justify-center">
        <p className="text-muted-foreground text-xs">
          Step {currentStep + 1} of {steps.length} — {steps[currentStep]?.label}
        </p>
      </div>

      {children}
    </AuthShellLayout>
  );
}
