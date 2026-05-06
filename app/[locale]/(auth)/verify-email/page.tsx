import { Suspense } from "react";
import { VerifyEmailPage } from "@/core/auth/components/VerifyEmailPage";

export default function Page() {
	return (
		<Suspense>
			<VerifyEmailPage />
		</Suspense>
	);
}
