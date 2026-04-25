// This file configures the initialization of Sentry on the browser.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: "https://4aa33635555da8baf6ef772e20034ba8@o4511118921760768.ingest.us.sentry.io/4511118932443136",

	// Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
	tracesSampleRate: 1,

	// Enable logs to be sent to Sentry
	enableLogs: true,

	// Enable sending user PII (Personally Identifiable Information)
	sendDefaultPii: true,

	// Setting this option to true will print useful information to the console while you're setting up Sentry.
	debug: false,
});
