"use client";

import { Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OnboardingLayout } from "@/core/onboarding/layouts/OnboardingLayout";
import { ONBOARDING_STEPS } from "@/core/onboarding/steps/steps-config";

const INDUSTRIES = [
  { id: "real-estate", label: "Real Estate" },
  { id: "finance", label: "Finance & Banking" },
  { id: "retail", label: "Retail & E-commerce" },
  { id: "healthcare", label: "Healthcare" },
  { id: "technology", label: "Technology" },
  { id: "construction", label: "Construction" },
  { id: "hospitality", label: "Hospitality & Tourism" },
  { id: "other", label: "Other" },
] as const;

const TEAM_SIZES = ["1–5", "6–20", "21–50", "51–200", "200+"] as const;

/**
 * Onboarding Step 2 — Industry + team size.
 * TODO: wire to convex/orgs/mutations.ts updateOrg when ready.
 */
export function IndustryStep() {
  const router = useRouter();
  const [industry, setIndustry] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState<string | null>(null);

  return (
    <OnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStep={1}
      panel={{
        icon: <Briefcase className="size-10" />,
        title: "Tell us about your business",
        tagline: "We'll tailor Orbitly to your industry.",
        bottomLeft: { heading: "Industry templates", body: "Pre-built pipelines and fields for your sector." },
        bottomRight: { heading: "Scales with you", body: "From solo founder to 500-person team — Orbitly grows with you." },
      }}
    >
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[380px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">About your business</h1>
          <p className="text-muted-foreground text-sm">Help us set up the right defaults for you.</p>
        </div>

        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: call updateOrg mutation with { industry, teamSize }
            router.push("/onboarding/complete");
          }}
        >
          {/* Industry */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Industry</p>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndustry(item.id)}
                  className={cn(
                    "rounded-[--radius] border px-3 py-2 text-start text-sm transition-colors",
                    industry === item.id
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Team size */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Team size</p>
            <div className="flex flex-wrap gap-2">
              {TEAM_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setTeamSize(size)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors",
                    teamSize === size
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full" type="submit" disabled={!industry || !teamSize}>
            Continue
          </Button>
        </form>
      </div>
    </OnboardingLayout>
  );
}
