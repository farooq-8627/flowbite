import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
	// Static locale for now — expand to dynamic routing when adding more languages
	const locale = "en";

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
});
