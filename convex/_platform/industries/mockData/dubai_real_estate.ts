/**
 * Mock data for the Dubai / Gulf Real Estate template.
 *
 * Pipeline: NEW → VIEW → OFR → FORMF → EJ → HO → WON | LOST.
 *
 * The Gulf template's `fieldDefinitions` cluster is the largest in the
 * codebase (16 deal fields across 5 stage gates). This seed populates
 * EVERY field on at least one deal record so the user never sees an
 * empty cell on the dashboard board for any stage they navigate to.
 *
 * Coverage strategy:
 *   - Always-visible: property_address, rera_permit_number, asking_price_aed.
 *   - OFR + FORMF + EJ + HO + WON: agreed_price_aed, commission_pct.
 *   - FORMF + EJ + HO: emirates_id_number, emirates_id_file (placeholder),
 *     passport_number, passport_file (placeholder).
 *   - FORMF + EJ + HO + WON: form_f_signed_date.
 *   - FORMF + EJ + HO: form_f_file (placeholder).
 *   - EJ + HO + WON: ejari_number, lease_start_date, lease_expiry_date.
 *   - EJ + HO: ejari_file (placeholder).
 *   - HO + WON: handover_date.
 *
 * "File" placeholder values are stable strings ("seeded:emirates-id.pdf")
 * — the seeder writes them straight into `fieldValues` so the table cell
 * renders the filename. The actual file upload flow is unaffected; the
 * cell shows "📎 seeded:emirates-id.pdf" which the user can replace by
 * uploading a real file.
 *
 * Realistic-looking but obviously-fake document numbers (Emirates ID,
 * passport) so the Compliance + Documents columns are populated without
 * leaking PII.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const dubaiRealEstateMockData: MockDataSeed = {
	companies: [
		{
			key: "driven-properties",
			name: "Driven Properties LLC",
			industry: "Real Estate",
			website: "https://drivenproperties.example.ae",
			fieldValues: {
				rera_orn: "ORN-12345",
				trade_license: "TL-987654",
			},
		},
		{
			key: "marina-keys",
			name: "Marina Keys Realty",
			industry: "Real Estate",
			website: "https://marinakeys.example.ae",
			fieldValues: {
				rera_orn: "ORN-65432",
				trade_license: "TL-456789",
			},
		},
	],
	leads: [
		{
			displayName: "Sarah Khan",
			email: "sarah.khan@example.com",
			phone: "+971 50 123 4567",
			status: "new",
			fieldValues: {
				preferred_area: "Dubai Marina",
				property_type: "Apartment",
				bedrooms: "2BR",
				budget_aed: 1800000,
				intent: "Buy",
			},
			tags: ["Hot inquiry", "End user"],
		},
		{
			displayName: "Ahmed Al-Maktoum",
			email: "ahmed.al@example.com",
			phone: "+971 55 987 6543",
			status: "contacted",
			fieldValues: {
				preferred_area: "JVC",
				property_type: "Villa",
				bedrooms: "3BR",
				budget_aed: 2500000,
				intent: "Buy",
			},
			tags: ["Cash buyer", "VIP client"],
		},
		{
			displayName: "Priya Sharma",
			email: "priya.s@example.com",
			phone: "+971 52 456 7890",
			status: "new",
			fieldValues: {
				preferred_area: "Business Bay",
				property_type: "Office",
				bedrooms: "Studio",
				budget_aed: 950000,
				intent: "Rent — Annual",
			},
			tags: ["Mortgage required"],
		},
		{
			displayName: "Fadi Najjar",
			email: "fadi.n@example.com",
			phone: "+971 56 222 3344",
			status: "new",
			fieldValues: {
				preferred_area: "Palm Jumeirah",
				property_type: "Villa",
				bedrooms: "5BR+",
				budget_aed: 18000000,
				intent: "Buy",
			},
			tags: ["VIP client", "Cash buyer"],
		},
	],
	contacts: [
		{
			displayName: "Omar Hassan",
			email: "omar.hassan@example.com",
			phone: "+971 50 111 2222",
			companyKey: "driven-properties",
			fieldValues: {
				nationality: "UAE",
				preferred_language: "Arabic",
			},
		},
		{
			displayName: "Lisa Chen",
			email: "lisa.chen@example.com",
			phone: "+971 56 333 4444",
			companyKey: "marina-keys",
			fieldValues: {
				nationality: "Singapore",
				preferred_language: "English",
			},
			tags: ["Investor"],
		},
		{
			displayName: "Vikram Mehta",
			email: "vikram.m@example.com",
			phone: "+971 50 555 6677",
			fieldValues: {
				nationality: "India",
				preferred_language: "Hindi",
			},
			tags: ["End user"],
		},
	],
	deals: [
		{
			title: "Marina Heights — 2BR Rental",
			stageCode: "VIEW",
			value: 145000,
			contactDisplayName: "Lisa Chen",
			companyKey: "marina-keys",
			fieldValues: {
				property_address: "Marina Heights Tower, Dubai Marina",
				rera_permit_number: "RP-2024-0001",
				asking_price_aed: 145000,
			},
			tags: ["Hot inquiry"],
		},
		{
			title: "Palm Jumeirah Villa — Offer / MOU",
			stageCode: "OFR",
			value: 17500000,
			contactDisplayName: "Vikram Mehta",
			fieldValues: {
				property_address: "Frond H, Palm Jumeirah, Dubai",
				rera_permit_number: "RP-2024-0044",
				asking_price_aed: 18000000,
				agreed_price_aed: 17500000,
				commission_pct: 2,
			},
			tags: ["VIP client", "Cash buyer"],
		},
		{
			title: "JVC District 14 — 3BR Villa Sale",
			stageCode: "FORMF",
			value: 2400000,
			contactDisplayName: "Omar Hassan",
			companyKey: "driven-properties",
			fieldValues: {
				property_address: "District 14, Jumeirah Village Circle",
				rera_permit_number: "RP-2024-0002",
				asking_price_aed: 2500000,
				agreed_price_aed: 2400000,
				commission_pct: 2,
				emirates_id_number: "784-1995-1234567-9",
				emirates_id_file: "seeded:emirates-id-omar.pdf",
				passport_number: "P12345678",
				passport_file: "seeded:passport-omar.pdf",
				form_f_signed_date: Date.now() - 3 * DAY_MS,
				form_f_file: "seeded:form-f-jvc.pdf",
			},
			tags: ["Form F submitted", "Cash buyer"],
		},
		{
			title: "Business Bay Office — Ejari Registration",
			stageCode: "EJ",
			value: 285000,
			contactDisplayName: "Vikram Mehta",
			fieldValues: {
				property_address: "Bay Square Office Tower, Business Bay",
				rera_permit_number: "RP-2024-0091",
				asking_price_aed: 300000,
				agreed_price_aed: 285000,
				commission_pct: 5,
				emirates_id_number: "784-1988-7654321-0",
				emirates_id_file: "seeded:emirates-id-vikram.pdf",
				passport_number: "P98765432",
				passport_file: "seeded:passport-vikram.pdf",
				form_f_signed_date: Date.now() - 14 * DAY_MS,
				form_f_file: "seeded:form-f-business-bay.pdf",
				ejari_number: "EJ-2026-DM-0098765",
				ejari_file: "seeded:ejari-business-bay.pdf",
				lease_start_date: Date.now() + 7 * DAY_MS,
				lease_expiry_date: Date.now() + 372 * DAY_MS,
			},
			tags: ["Ejari pending"],
		},
		{
			title: "Downtown Dubai 1BR — Handover",
			stageCode: "HO",
			value: 1850000,
			contactDisplayName: "Omar Hassan",
			companyKey: "driven-properties",
			fieldValues: {
				property_address: "Burj Vista 1, Downtown Dubai",
				rera_permit_number: "RP-2024-0123",
				asking_price_aed: 1900000,
				agreed_price_aed: 1850000,
				commission_pct: 2,
				emirates_id_number: "784-1990-9876543-2",
				emirates_id_file: "seeded:emirates-id-handover.pdf",
				passport_number: "P55667788",
				passport_file: "seeded:passport-handover.pdf",
				form_f_signed_date: Date.now() - 30 * DAY_MS,
				form_f_file: "seeded:form-f-downtown.pdf",
				ejari_number: "EJ-2026-DT-0045678",
				ejari_file: "seeded:ejari-downtown.pdf",
				lease_start_date: Date.now() + 1 * DAY_MS,
				lease_expiry_date: Date.now() + 366 * DAY_MS,
				handover_date: Date.now() + 1 * DAY_MS,
			},
			tags: ["VIP client"],
		},
		{
			title: "Arabian Ranches Villa — Active Tenancy",
			stageCode: "WON",
			value: 4500000,
			contactDisplayName: "Lisa Chen",
			companyKey: "marina-keys",
			fieldValues: {
				property_address: "Saheel 1, Arabian Ranches, Dubai",
				rera_permit_number: "RP-2023-0987",
				asking_price_aed: 4600000,
				agreed_price_aed: 4500000,
				commission_pct: 2,
				form_f_signed_date: Date.now() - 90 * DAY_MS,
				ejari_number: "EJ-2026-AR-0012345",
				lease_start_date: Date.now() - 75 * DAY_MS,
				lease_expiry_date: Date.now() + 290 * DAY_MS,
				handover_date: Date.now() - 75 * DAY_MS,
			},
			tags: ["Renewal upcoming", "Investor"],
		},
		{
			title: "Mirdif Townhouse — New Inquiry",
			stageCode: "NEW",
			value: 2200000,
			fieldValues: {
				property_address: "Mirdif Hills, Dubai",
				rera_permit_number: "RP-2024-0212",
				asking_price_aed: 2200000,
			},
			tags: ["Hot inquiry"],
		},
	],
	notes: [
		{
			content:
				"Sarah called — wants to see Marina Heights this Saturday at 4pm. Bring floor plans + service charge breakdown.",
			categoryName: "Today",
			anchorTo: { kind: "lead", displayName: "Sarah Khan" },
		},
		{
			content: "Ahmed pre-approved for AED 2.5M mortgage. Ready to move on JVC villa.",
			categoryName: "Hot Inquiry",
			anchorTo: { kind: "lead", displayName: "Ahmed Al-Maktoum" },
		},
		{
			content:
				"Form F signed. Awaiting Emirates ID copy from buyer + Ejari registration this week.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "JVC District 14 — 3BR Villa Sale" },
		},
		{
			content: "Lisa interested in second viewing — wants to bring her husband.",
			categoryName: "Viewing Notes",
			anchorTo: { kind: "deal", title: "Marina Heights — 2BR Rental" },
		},
		{
			content:
				"Downtown Dubai handover scheduled tomorrow. Confirm utilities transfer + key handover meeting.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Downtown Dubai 1BR — Handover" },
		},
		{
			content:
				"Arabian Ranches lease renewal window opens in 90 days — set reminder for 30-day pre-notice.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Arabian Ranches Villa — Active Tenancy" },
		},
		{
			content: "Fadi wants Palm Jumeirah villa — schedule yacht-access viewing this weekend.",
			categoryName: "Hot Inquiry",
			anchorTo: { kind: "lead", displayName: "Fadi Najjar" },
		},
	],
	tasks: [
		{
			title: "Marina Heights viewing — Sarah Khan",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Sarah Khan" },
		},
		{
			title: "Collect Emirates ID copy — JVC sale",
			dueOffsetDays: 1,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "JVC District 14 — 3BR Villa Sale" },
		},
		{
			title: "Call Priya re: Business Bay availability",
			dueOffsetDays: 2,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Priya Sharma" },
		},
		{
			title: "Downtown Dubai handover walkthrough",
			dueOffsetDays: 1,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Downtown Dubai 1BR — Handover" },
		},
		{
			title: "Palm Jumeirah viewing — Fadi Najjar (private yacht access)",
			dueOffsetDays: 3,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Fadi Najjar" },
		},
		{
			title: "Arabian Ranches — open 60-day pre-renewal window in 30 days",
			dueOffsetDays: 30,
			priority: "normal",
			source: "followup",
			anchorTo: { kind: "deal", title: "Arabian Ranches Villa — Active Tenancy" },
		},
	],
};
