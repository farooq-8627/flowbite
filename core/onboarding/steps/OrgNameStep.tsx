"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OnboardingLayout } from "@/core/onboarding/layouts/OnboardingLayout";
import { ONBOARDING_STEPS } from "@/core/onboarding/steps/steps-config";

/**
 * Onboarding Step 1 — Org name + slug.
 * TODO: wire to convex/orgs/mutations.ts createOrg when ready.
 */
export function OrgNameStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugEdited) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  return (
    <OnboardingLayout
      steps={ONBOARDING_STEPS}
      currentStep={0}
      panel={{
        icon: <Building2 className="size-10" />,
        title: "Set up your workspace",
        tagline: "Your team's home in Orbitly.",
        bottomLeft: { heading: "Your workspace, your rules", body: "Rename modules, set pipelines, and customise everything." },
        bottomRight: { heading: "Invite your team", body: "Add members after setup — roles and permissions included." },
      }}
    >
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">Name your workspace</h1>
          <p className="text-muted-foreground text-sm">This is how your team will identify your org.</p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: call createOrg mutation with { name, slug }
            router.push("/onboarding/industry");
          }}
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor="org-name">Workspace Name</FieldLabel>
            <Input
              id="org-name"
              name="orgName"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="org-slug">URL Slug</FieldLabel>
            <div className="flex items-center rounded-[var(--radius)] border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span className="select-none border-r border-input px-3 py-2 text-muted-foreground text-sm">orbitly.app/</span>
              <input
                id="org-slug"
                name="orgSlug"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                placeholder="acme-corp"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                required
              />
            </div>
          </Field>

          <Button className="w-full" type="submit" disabled={!name || !slug}>
            Continue
          </Button>
        </form>
      </div>
    </OnboardingLayout>
  );
}
