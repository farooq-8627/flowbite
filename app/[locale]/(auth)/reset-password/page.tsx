import { Suspense } from "react";
import { ResetPasswordPage } from "@/core/auth/components/ResetPasswordPage";

export default function Page() {
	return (
		<Suspense>
			<ResetPasswordPage />
		</Suspense>
	);
}
