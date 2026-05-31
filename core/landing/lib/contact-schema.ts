import { z } from "zod";

/**
 * Client-safe contact schema + options. Shared by the contact form
 * (client) and the server handler (`contact.ts`). Kept free of any
 * server-only code (no Resend, no process.env) so importing it into a
 * client component never pulls Node SDKs into the browser bundle.
 */

export const CONTACT_INTERESTS = [
	{ value: "product", label: "Using the product" },
	{ value: "custom-crm", label: "A custom CRM for my business" },
	{ value: "custom-website", label: "A custom website / web app" },
	{ value: "migration", label: "Migrating from another CRM" },
	{ value: "other", label: "Something else" },
] as const;

const interestValues = CONTACT_INTERESTS.map((i) => i.value) as [string, ...string[]];

export const contactSchema = z.object({
	name: z.string().trim().min(2, "Please enter your name.").max(100),
	email: z.string().trim().email("Please enter a valid email address.").max(200),
	company: z.string().trim().max(150).optional().or(z.literal("")),
	interest: z.enum(interestValues),
	message: z.string().trim().min(10, "Please add a few more details.").max(4000),
	/** Honeypot — real users never fill this hidden field. */
	website: z.string().max(0).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;
