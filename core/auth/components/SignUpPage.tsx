"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Globe, Orbit } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AuthShellLayout } from "@/core/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";
import { APP_CONFIG } from "@/config/app-config";

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function SignUpPage() {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
  const [joinExisting, setJoinExisting] = useState(false);
  const router = useRouter();

  const handleOAuth = (provider: "github" | "google") => {
    setOauthLoading(provider);
    void signIn(provider).catch((err: Error) => {
      posthog.capture("oauth_sign_up_failed", { provider, error_message: err.message });
      toast.authError(err);
      setOauthLoading(null);
    });
  };

  return (
    <AuthShellLayout
      panel={{
        icon: <Orbit className="size-10" />,
        title: APP_CONFIG.name,
        tagline: APP_CONFIG.description,
        bottomLeft: { heading: "Start in minutes", body: "Set up your workspace and invite your team right away." },
        bottomRight: { heading: "Joining a team?", body: "Enter your org ID and we'll send a request to the admin." },
      }}
    >
      <div className="absolute top-5 end-0 flex w-full justify-end px-10">
        <p className="text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link prefetch={false} className="text-foreground font-medium underline underline-offset-4" href="/signin">
            Login
          </Link>
        </p>
      </div>

      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">Create your account</h1>
          <p className="text-muted-foreground text-sm">Please enter your details to register.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full" disabled={!!oauthLoading} onClick={() => handleOAuth("google")}>
              <GoogleIcon />
              {oauthLoading === "google" ? "…" : "Google"}
            </Button>
            <Button variant="outline" className="w-full" disabled={!!oauthLoading} onClick={() => handleOAuth("github")}>
              <GitHubIcon />
              {oauthLoading === "github" ? "…" : "GitHub"}
            </Button>
          </div>

          <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
            <span className="relative z-10 bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              const formData = new FormData(e.currentTarget);
              const email = formData.get("email") as string;
              const password = formData.get("password") as string;
              const confirm = formData.get("confirmPassword") as string;

              if (password !== confirm) {
                toast.error("Passwords do not match.");
                setLoading(false);
                return;
              }

              formData.set("flow", "signUp");
              void signIn("password", formData)
                .then(() => {
                  posthog.identify(email, { email });
                  posthog.capture("user_signed_up", { email, method: "password" });
                  router.push("/onboarding/org-name");
                })
                .catch((err: Error) => {
                  posthog.capture("sign_up_failed", { error_message: err.message });
                  toast.authError(err);
                  setLoading(false);
                });
            }}
          >
            <FieldGroup className="gap-4">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="signup-email">Email Address</FieldLabel>
                <Input id="signup-email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                <Input id="signup-password" name="password" type="password" placeholder="••••••••" autoComplete="new-password" minLength={8} required />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="signup-confirm">Confirm Password</FieldLabel>
                <Input id="signup-confirm" name="confirmPassword" type="password" placeholder="••••••••" autoComplete="new-password" minLength={8} required />
              </Field>
            </FieldGroup>

            <Button className="w-full rounded-[var(--radius)]" type="submit" disabled={loading || !!oauthLoading}>
              {loading ? "Creating account…" : "Register"}
            </Button>
          </form>

          <div>
            <Separator className="my-2" />
            <button
              type="button"
              className="w-full text-center text-muted-foreground text-sm hover:text-foreground transition-colors"
              onClick={() => setJoinExisting((v) => !v)}
            >
              {joinExisting ? "▲ Hide" : "▼ Joining an existing workspace?"}
            </button>

            {joinExisting && (
              <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-border bg-muted/40 p-4">
                <p className="text-muted-foreground text-xs">
                  Enter the Org ID shared by your admin. A confirmation request will be sent to them.
                </p>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="org-id">Org ID</FieldLabel>
                  <Input id="org-id" name="orgId" placeholder="org_xxxxxxxx" autoComplete="off" />
                </Field>
                <Button variant="outline" className="w-full rounded-[var(--radius)]" type="button" disabled>
                  Request to Join (coming soon)
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 flex w-full justify-between px-10">
        <div className="text-muted-foreground text-sm">© {new Date().getFullYear()} {APP_CONFIG.name}</div>
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Globe className="size-4" />
          ENG
        </div>
      </div>
    </AuthShellLayout>
  );
}
