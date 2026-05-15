import { Suspense } from "react";
import { ResetPasswordPage } from "@/core/shell/auth/components/ResetPasswordPage";

export default function Page() {
	return (
		<Suspense>
			<ResetPasswordPage />
		</Suspense>
	);
}
