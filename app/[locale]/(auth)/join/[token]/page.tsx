import { JoinOrgPage } from "@/core/shell/auth/components/JoinOrgPage";

interface Props {
	params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
	const { token } = await params;
	return <JoinOrgPage token={token} />;
}
