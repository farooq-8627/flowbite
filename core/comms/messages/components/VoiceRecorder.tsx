"use client";

/**
 * VoiceRecorder — micro audio recorder for voice notes in the chat composer.
 *
 * Uses the platform `MediaRecorder` API directly — no third-party library.
 * Captures `audio/webm` (broadest desktop support) or whatever the platform
 * picks via `MediaRecorder.isTypeSupported`. Returns the recorded `Blob` to
 * the parent (`MessageInput`) via `onSend`, which is then fed through the
 * standard 3-step upload pipeline (`generateUploadUrl` → PUT → `record`).
 *
 * The component handles the mic permission prompt itself — if denied, it
 * surfaces a friendly inline error and a "try again" button.
 *
 * UX:
 *   - Initial state: a single mic button (handled by the parent — this
 *     component is shown once recording starts).
 *   - Recording: red dot + "MM:SS" timer + Stop / Cancel.
 *   - After stop: Play preview, Re-record, Send.
 *
 * Cleanup: revokes the preview object URL on unmount and stops the mic
 * stream tracks so the OS-level "recording" indicator goes away.
 */

import { Loader2, Mic, Pause, Play, RotateCcw, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";

type Props = {
	disabled?: boolean;
	/** Called when the user hits Send. Parent uploads the blob. */
	onSend: (file: File, durationMs: number) => Promise<void> | void;
	/** Called when the recorder panel should close (Cancel or after Send). */
	onClose: () => void;
	className?: string;
};

type Phase = "idle" | "requesting" | "recording" | "preview" | "sending" | "error";

function pickMimeType(): string {
	const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
	for (const c of candidates) {
		if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
	}
	return "audio/webm";
}

function formatDuration(ms: number): string {
	const total = Math.floor(ms / 1000);
	const mm = Math.floor(total / 60)
		.toString()
		.padStart(2, "0");
	const ss = (total % 60).toString().padStart(2, "0");
	return `${mm}:${ss}`;
}

export function VoiceRecorder({ disabled, onSend, onClose, className }: Props) {
	const [phase, setPhase] = useState<Phase>("idle");
	const [error, setError] = useState<string | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const blobRef = useRef<Blob | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const startedAtRef = useRef<number | null>(null);
	const tickRef = useRef<number | null>(null);
	const previewAudioRef = useRef<HTMLAudioElement | null>(null);
	const finalDurationRef = useRef<number>(0);

	const cleanupStream = useCallback(() => {
		streamRef.current?.getTracks().forEach((t) => {
			t.stop();
		});
		streamRef.current = null;
	}, []);

	const start = useCallback(async () => {
		setError(null);
		setPhase("requesting");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			const mimeType = pickMimeType();
			const rec = new MediaRecorder(stream, { mimeType });
			chunksRef.current = [];
			rec.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};
			rec.onstop = () => {
				const blob = new Blob(chunksRef.current, { type: mimeType });
				blobRef.current = blob;
				const url = URL.createObjectURL(blob);
				setPreviewUrl(url);
				setPhase("preview");
				cleanupStream();
			};
			rec.start();
			mediaRecorderRef.current = rec;
			startedAtRef.current = Date.now();
			setElapsed(0);
			tickRef.current = window.setInterval(() => {
				if (startedAtRef.current) setElapsed(Date.now() - startedAtRef.current);
			}, 200);
			setPhase("recording");
		} catch (err) {
			cleanupStream();
			setError(
				err instanceof Error
					? err.name === "NotAllowedError"
						? "Microphone access was denied. Allow it in your browser settings to record."
						: err.message
					: "Couldn't access the microphone.",
			);
			setPhase("error");
		}
	}, [cleanupStream]);

	const stop = useCallback(() => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			finalDurationRef.current = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
			mediaRecorderRef.current.stop();
		}
		if (tickRef.current) {
			window.clearInterval(tickRef.current);
			tickRef.current = null;
		}
	}, []);

	const cancel = useCallback(() => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.onstop = null;
			mediaRecorderRef.current.stop();
		}
		if (tickRef.current) {
			window.clearInterval(tickRef.current);
			tickRef.current = null;
		}
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		cleanupStream();
		blobRef.current = null;
		setPreviewUrl(null);
		setElapsed(0);
		startedAtRef.current = null;
		setPhase("idle");
		onClose();
	}, [cleanupStream, onClose, previewUrl]);

	const togglePreview = useCallback(() => {
		const el = previewAudioRef.current;
		if (!el) return;
		if (el.paused) {
			void el.play();
			setIsPreviewPlaying(true);
		} else {
			el.pause();
			setIsPreviewPlaying(false);
		}
	}, []);

	const reRecord = useCallback(() => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		blobRef.current = null;
		setPreviewUrl(null);
		setElapsed(0);
		startedAtRef.current = null;
		setPhase("idle");
		void start();
	}, [previewUrl, start]);

	const send = useCallback(async () => {
		if (!blobRef.current) return;
		setPhase("sending");
		try {
			const ext = blobRef.current.type.includes("mp4")
				? "m4a"
				: blobRef.current.type.includes("ogg")
					? "ogg"
					: "webm";
			const file = new File([blobRef.current], `voice-${Date.now()}.${ext}`, {
				type: blobRef.current.type,
			});
			await onSend(file, finalDurationRef.current);
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			setPreviewUrl(null);
			blobRef.current = null;
			onClose();
		} catch (err) {
			setError(normalizeError(err, "Couldn't send voice note."));
			setPhase("preview");
		}
	}, [onClose, onSend, previewUrl]);

	// Auto-start when the panel is mounted.
	const startedRef = useRef(false);
	useEffect(() => {
		if (!startedRef.current) {
			startedRef.current = true;
			void start();
		}
	}, [start]);

	// Cleanup on unmount. We capture the latest values via refs that already
	// exist (streamRef, previewUrl-capturing closure) and use a stable
	// callback ref pattern via the latest closure.
	const cleanupRef = useRef<() => void>(() => {});
	cleanupRef.current = () => {
		if (tickRef.current) window.clearInterval(tickRef.current);
		cleanupStream();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	};
	useEffect(() => {
		return () => cleanupRef.current();
	}, []);

	return (
		<section
			className={cn(
				"flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-muted/40 p-2",
				className,
			)}
			aria-label="Voice note recorder"
		>
			{phase === "requesting" && (
				<>
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span className="text-xs text-muted-foreground">Requesting microphone…</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="ms-auto h-7 gap-1 px-2 text-xs"
						onClick={cancel}
					>
						<X className="size-3.5" aria-hidden="true" />
						Cancel
					</Button>
				</>
			)}

			{phase === "recording" && (
				<>
					<span
						className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive"
						aria-hidden="true"
					/>
					<span className="text-xs font-medium tabular-nums text-foreground">
						{formatDuration(elapsed)}
					</span>
					<span className="ms-1 text-xs text-muted-foreground">Recording…</span>
					<div className="ms-auto flex items-center gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 gap-1 px-2 text-xs"
							onClick={cancel}
							disabled={disabled}
						>
							<X className="size-3.5" aria-hidden="true" />
							Cancel
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
							onClick={stop}
							disabled={disabled}
						>
							<Square className="size-3.5" aria-hidden="true" />
							Stop
						</Button>
					</div>
				</>
			)}

			{phase === "preview" && previewUrl && (
				<>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7"
						onClick={togglePreview}
						aria-label={isPreviewPlaying ? "Pause preview" : "Play preview"}
					>
						{isPreviewPlaying ? (
							<Pause className="size-3.5" aria-hidden="true" />
						) : (
							<Play className="size-3.5" aria-hidden="true" />
						)}
					</Button>
					<span className="text-xs tabular-nums text-foreground">
						{formatDuration(finalDurationRef.current || elapsed)}
					</span>
					<audio
						ref={previewAudioRef}
						src={previewUrl}
						onEnded={() => setIsPreviewPlaying(false)}
					>
						<track kind="captions" />
					</audio>
					<div className="ms-auto flex items-center gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 gap-1 px-2 text-xs"
							onClick={reRecord}
							disabled={disabled}
							aria-label="Re-record"
						>
							<RotateCcw className="size-3.5" aria-hidden="true" />
							Re-record
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
							onClick={() => void send()}
							disabled={disabled}
						>
							<Send className="size-3.5" aria-hidden="true" />
							Send
						</Button>
					</div>
				</>
			)}

			{phase === "sending" && (
				<>
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span className="text-xs text-muted-foreground">Sending voice note…</span>
				</>
			)}

			{phase === "error" && (
				<>
					<Mic className="size-4 text-destructive" aria-hidden="true" />
					<span className="text-xs text-destructive">{error}</span>
					<div className="ms-auto flex items-center gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 gap-1 px-2 text-xs"
							onClick={cancel}
						>
							<X className="size-3.5" aria-hidden="true" />
							Close
						</Button>
						<Button
							type="button"
							size="sm"
							className="h-7 gap-1 px-2 text-xs"
							onClick={() => void start()}
						>
							Try again
						</Button>
					</div>
				</>
			)}
		</section>
	);
}
