"use client";

import { CheckCircle2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { OnboardingLayout } from "@/core/onboarding/layouts/OnboardingLayout";
import { ONBOARDING_STEPS } from "@/core/onboarding/steps/steps-config";

/**
 * Onboarding Step 3 — Completion screen.
 * TODO: mark onboarding complete in Convex (users.onboardingComplete = true) and redirect to dashboard.
 */
export function CompleteStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLaunch = () => {
    setLoading(true);
    // TODO: call markOnboardingComplete mutation, then redirect to /dashboard/[orgSlug]
    // For now, redirect to dashboard root
    router.push("/dashboard");
  };

  return (
    <OnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStep={2}
      panel={{
        icon: <Rocket className="size-10" />,
        title: "You're all set!",
        tagline: "Your workspace is ready to launch.",
        bottomLeft: { heading: "What's next?", body: "Add your first lead, invite your team, and start closing deals." },
        bottomRight: { heading: "Need a hand?", body: "Our onboarding guide walks you through every feature." },
      }}
    >
      <div className="mx-auto flex w-full flex-col items-center justify-center space-y-8 sm:w-[350px]">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="font-medium text-3xl">Workspace ready!</h1>
            <p className="text-muted-foreground text-sm">
              Everything is set up. Let&apos;s take you to your dashboard.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="w-full space-y-2">
          {[
            { icon: "✓", label: "Workspace created" },
            { icon: "✓", label: "Industry configured" },
            { icon: "✓", label: "Default pipeline ready" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-[--radius] border border-border bg-muted/40 px-4 py-2.5"
            >
              <span className="text-primary font-bold">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </div>

        <Button className="w-full" onClick={handleLaunch} disabled={loading}>
          {loading ? "Launching…" : "Go to Dashboard →"}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
