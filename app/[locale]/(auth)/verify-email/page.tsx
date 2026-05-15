import { Suspense } from "react";
import { VerifyEmailPage } from "@/core/shell/auth/components/VerifyEmailPage";

export default function Page() {
	return (
		<Suspense>
			<VerifyEmailPage />
		</Suspense>
	);
}
