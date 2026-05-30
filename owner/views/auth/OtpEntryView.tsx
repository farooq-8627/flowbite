"use client";

/**
 * Owner-panel OTP entry view (Stage 1).
 *
 * Two-step UX:
 *   1. "Send code" — fires `requestOwnerOtpAction` (server action). On
 *      success, swaps to the verify form and starts a countdown.
 *   2. "Verify code" — POSTs the typed 6 digits to `verifyOwnerOtpAction`
 *      which sets the `owner_otp_verified` cookie and returns. We then
 *      `router.push(OWNER_PATHS.overview)` and `router.refresh()` so the
 *      layout re-runs the gate with the cookie present.
 *
 * Resend is rate-limited server-side (5 requests / 15 min — see
 * `convex/_platform/otp/mutations.ts::requestOtp`). The button stays
 * disabled for the first 30 seconds of the countdown so the user can't
 * accidentally spam the request.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 1-F.
 */
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
	type RequestOtpResult,
	requestOwnerOtpAction,
	type VerifyOtpResult,
	verifyOwnerOtpAction,
} from "@/app/xowner/auth/actions";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { maskEmail } from "@/lib/format";
import { useOwnerPublicPrefix } from "../../hooks/useOwnerPublicPrefix";

const RESEND_LOCKOUT_SEC = 30;

export function OtpEntryView() {
	const router = useRouter();
	const publicPrefix = useOwnerPublicPrefix();
	const [stage, setStage] = useState<"request" | "verify">("request");
	const [request, setRequest] = useState<RequestOtpResult | null>(null);
	const [verifyResult, setVerifyResult] = useState<VerifyOtpResult | null>(null);
	const [code, setCode] = useState("");
	const [isRequestPending, startRequestTransition] = useTransition();
	const [isVerifyPending, startVerifyTransition] = useTransition();

	const submitOnFillRef = useRef<((code: string) => void) | null>(null);
	submitOnFillRef.current = (filled) => {
		if (filled.length === 6 && !isVerifyPending) {
			submitVerify(filled);
		}
	};

	function handleSendCode() {
		startRequestTransition(async () => {
			const result = await requestOwnerOtpAction();
			setRequest(result);
			if (result.ok) {
				setStage("verify");
				setCode("");
				setVerifyResult(null);
			}
		});
	}

	function submitVerify(submittedCode: string) {
		const fd = new FormData();
		fd.set("code", submittedCode);
		startVerifyTransition(async () => {
			const result = await verifyOwnerOtpAction(fd);
			setVerifyResult(result);
			if (result.ok) {
				// Push to the PUBLIC slug-prefixed overview path. Pushing to
				// `/xowner/overview` would bounce off middleware's direct-hit
				// block (404). `useOwnerPublicPrefix` derives the slug from
				// the current pathname — no env access needed.
				const target = publicPrefix ? `${publicPrefix}/overview` : "/overview";
				router.push(target);
				router.refresh();
			}
		});
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-6">
			<div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-6 shadow-sm">
				<header className="mb-5 flex items-center justify-between">
					<div>
						<h1 className="text-base font-semibold leading-tight">
							Platform owner verification
						</h1>
						<p className="mt-1 text-xs text-muted-foreground">
							An email code is required every 15 minutes.
						</p>
					</div>
					<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
						Internal
					</span>
				</header>

				{stage === "request" ? (
					<RequestStep
						pending={isRequestPending}
						onSend={handleSendCode}
						errorMessage={request && !request.ok ? request.message : null}
					/>
				) : (
					<VerifyStep
						code={code}
						setCode={setCode}
						pending={isVerifyPending}
						onSubmit={() => submitVerify(code)}
						onAutoSubmit={(filled) => submitOnFillRef.current?.(filled)}
						onResend={handleSendCode}
						resendPending={isRequestPending}
						request={request?.ok ? request : null}
						errorMessage={
							verifyResult && !verifyResult.ok ? verifyResult.message : null
						}
					/>
				)}

				<p className="mt-5 rounded-[var(--radius)] bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
					You're signed in but the panel still requires a per-session OTP. The code
					expires after 15 minutes — you'll be asked again the next time you return.
				</p>
			</div>
		</main>
	);
}

function RequestStep({
	pending,
	onSend,
	errorMessage,
}: {
	pending: boolean;
	onSend: () => void;
	errorMessage: string | null;
}) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Click below to email a 6-digit verification code to your owner address.
			</p>
			<Button type="button" className="w-full" disabled={pending} onClick={onSend}>
				{pending ? (
					<>
						<Loader2 className="me-2 h-4 w-4 animate-spin" /> Sending…
					</>
				) : (
					"Email me a code"
				)}
			</Button>
			{errorMessage ? (
				<p className="rounded-[var(--radius)] bg-destructive/10 p-3 text-xs text-destructive">
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}

function VerifyStep({
	code,
	setCode,
	pending,
	onSubmit,
	onAutoSubmit,
	onResend,
	resendPending,
	request,
	errorMessage,
}: {
	code: string;
	setCode: (next: string) => void;
	pending: boolean;
	onSubmit: () => void;
	onAutoSubmit: (filled: string) => void;
	onResend: () => void;
	resendPending: boolean;
	request: { expiresAt: number; email: string } | null;
	errorMessage: string | null;
}) {
	const [secondsLeft, setSecondsLeft] = useState(() => deriveSecondsLeft(request?.expiresAt));
	const [resendIn, setResendIn] = useState(RESEND_LOCKOUT_SEC);

	useEffect(() => {
		setSecondsLeft(deriveSecondsLeft(request?.expiresAt));
		setResendIn(RESEND_LOCKOUT_SEC);
	}, [request?.expiresAt]);

	useEffect(() => {
		const id = window.setInterval(() => {
			setSecondsLeft((s) => Math.max(0, s - 1));
			setResendIn((s) => Math.max(0, s - 1));
		}, 1000);
		return () => window.clearInterval(id);
	}, []);

	const expired = secondsLeft <= 0;
	const canResend = !resendPending && resendIn === 0;

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (!pending && code.length === 6) onSubmit();
			}}
		>
			{request ? (
				<p className="text-sm text-muted-foreground">
					We sent a code to{" "}
					<span
						className="font-medium text-foreground"
						title="Email partially hidden for your security"
					>
						{maskEmail(request.email) || "your email"}
					</span>
					. It expires in {formatCountdown(secondsLeft)}.
				</p>
			) : null}

			<div className="flex justify-center">
				<InputOTP
					maxLength={6}
					value={code}
					onChange={(next) => {
						const digits = next.replace(/\D+/g, "").slice(0, 6);
						setCode(digits);
						if (digits.length === 6) onAutoSubmit(digits);
					}}
					autoFocus
					disabled={pending}
				>
					<InputOTPGroup>
						{[0, 1, 2, 3, 4, 5].map((i) => (
							<InputOTPSlot key={i} index={i} />
						))}
					</InputOTPGroup>
				</InputOTP>
			</div>

			{errorMessage ? (
				<p className="rounded-[var(--radius)] bg-destructive/10 p-3 text-xs text-destructive">
					{errorMessage}
				</p>
			) : null}

			<div className="flex flex-col gap-2">
				<Button type="submit" disabled={pending || code.length !== 6 || expired}>
					{pending ? (
						<>
							<Loader2 className="me-2 h-4 w-4 animate-spin" /> Verifying…
						</>
					) : (
						"Verify and continue"
					)}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onResend}
					disabled={!canResend}
				>
					{resendPending ? (
						<>
							<Loader2 className="me-2 h-4 w-4 animate-spin" /> Sending…
						</>
					) : resendIn > 0 ? (
						`Resend in ${resendIn}s`
					) : expired ? (
						"Send a new code"
					) : (
						"Send another code"
					)}
				</Button>
			</div>
		</form>
	);
}

function deriveSecondsLeft(expiresAt: number | undefined): number {
	if (!expiresAt) return 0;
	return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

function formatCountdown(secs: number): string {
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return `${m}m ${s.toString().padStart(2, "0")}s`;
}
