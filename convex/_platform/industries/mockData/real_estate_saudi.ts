/**
 * Mock data for the Saudi Arabia Real Estate template.
 *
 * Pipeline: NEW → VIEW → OFR → EJAR → SAKANI → HO → WON | LOST.
 *
 * Field coverage:
 *   - Lead: preferred_area, property_type, bedrooms, budget_sar, intent.
 *   - Contact: nationality, preferred_language, iqama_number.
 *   - Company: rega_license, commercial_registration.
 *   - Deal: property_address, asking_price_sar (always);
 *     agreed_price_sar + commission_pct (OFR+); ejar_contract_number,
 *     lease_start_date, lease_expiry_date (EJAR+); sakani_reference
 *     (SAKANI+).
 *
 * Realistic-looking but obviously-fake document numbers (Iqama,
 * commercial registration) so the Documents column is populated
 * without leaking PII.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const realEstateSaudiMockData: MockDataSeed = {
	companies: [
		{
			key: "riyadh-properties",
			name: "Riyadh Premier Properties",
			industry: "Real Estate",
			fieldValues: {
				rega_license: "REGA-1100123",
				commercial_registration: "CR-7894561",
			},
		},
		{
			key: "jeddah-homes",
			name: "Jeddah Homes Realty",
			industry: "Real Estate",
			fieldValues: {
				rega_license: "REGA-1100456",
				commercial_registration: "CR-7894890",
			},
		},
	],
	leads: [
		{
			displayName: "Khalid Al-Saud",
			email: "khalid.alsaud@example.com",
			phone: "+966 50 123 4567",
			status: "new",
			fieldValues: {
				preferred_area: "Riyadh - Al Malqa",
				property_type: "Villa",
				bedrooms: "4BR",
				budget_sar: 3500000,
				intent: "Buy",
			},
			tags: ["Cash buyer", "VIP client"],
		},
		{
			displayName: "Fatimah Al-Rashid",
			email: "fatimah.r@example.com",
			phone: "+966 55 987 6543",
			status: "contacted",
			fieldValues: {
				preferred_area: "Jeddah - Al Hamra",
				property_type: "Apartment",
				bedrooms: "2BR",
				budget_sar: 80000,
				intent: "Rent — Annual",
			},
			tags: ["Mortgage required"],
		},
		{
			displayName: "Tariq Al-Otaibi",
			email: "tariq.o@example.com",
			phone: "+966 53 456 7890",
			status: "new",
			fieldValues: {
				preferred_area: "Al Khobar - Corniche",
				property_type: "Apartment",
				bedrooms: "3BR",
				budget_sar: 1200000,
				intent: "Off-plan",
			},
			tags: ["Off-plan"],
		},
		{
			displayName: "Rana Al-Ghamdi",
			email: "rana.g@example.com",
			phone: "+966 56 222 3344",
			status: "new",
			fieldValues: {
				preferred_area: "Riyadh - Hittin",
				property_type: "Townhouse",
				bedrooms: "3BR",
				budget_sar: 2200000,
				intent: "Buy",
			},
			tags: ["Hot inquiry"],
		},
	],
	contacts: [
		{
			displayName: "Yousef Al-Harbi",
			email: "yousef@example.com",
			phone: "+966 50 222 3333",
			companyKey: "riyadh-properties",
			fieldValues: {
				nationality: "Saudi",
				preferred_language: "Arabic",
				iqama_number: "1098765432", // Saudi National ID format
			},
		},
		{
			displayName: "Noor Al-Qahtani",
			email: "noor.q@example.com",
			phone: "+966 56 444 5555",
			companyKey: "jeddah-homes",
			fieldValues: {
				nationality: "Saudi",
				preferred_language: "Arabic",
				iqama_number: "1075432198",
			},
		},
		{
			displayName: "Imran Khan (expat)",
			email: "imran.k@example.com",
			phone: "+966 57 666 7777",
			fieldValues: {
				nationality: "Pakistan",
				preferred_language: "Urdu",
				iqama_number: "2123456789", // expat Iqama format starts with 2
			},
			tags: ["VIP client"],
		},
	],
	deals: [
		{
			title: "Al Malqa Villa — 4BR Sale",
			stageCode: "VIEW",
			value: 3400000,
			contactDisplayName: "Yousef Al-Harbi",
			companyKey: "riyadh-properties",
			fieldValues: {
				property_address: "Al Malqa District, Riyadh",
				asking_price_sar: 3500000,
			},
			tags: ["Cash buyer"],
		},
		{
			title: "Al Hamra Apartment — Annual Lease",
			stageCode: "EJAR",
			value: 75000,
			contactDisplayName: "Noor Al-Qahtani",
			companyKey: "jeddah-homes",
			fieldValues: {
				property_address: "Al Hamra District, Jeddah",
				asking_price_sar: 80000,
				agreed_price_sar: 75000,
				commission_pct: 5,
				ejar_contract_number: "EJAR-2026-0421-7894",
				lease_start_date: Date.now() + 7 * DAY_MS,
				lease_expiry_date: Date.now() + 372 * DAY_MS,
			},
			tags: ["Ejar pending"],
		},
		{
			title: "Hittin Townhouse — Sakani Verification",
			stageCode: "SAKANI",
			value: 2150000,
			contactDisplayName: "Yousef Al-Harbi",
			companyKey: "riyadh-properties",
			fieldValues: {
				property_address: "Hittin District, Riyadh",
				asking_price_sar: 2200000,
				agreed_price_sar: 2150000,
				commission_pct: 2.5,
				ejar_contract_number: "EJAR-2026-0418-3210",
				sakani_reference: "SAK-2026-RIY-0418",
				lease_start_date: Date.now() + 14 * DAY_MS,
				lease_expiry_date: Date.now() + 379 * DAY_MS,
			},
			tags: ["Sakani pending"],
		},
		{
			title: "Khobar Corniche — Handover",
			stageCode: "HO",
			value: 1150000,
			contactDisplayName: "Imran Khan (expat)",
			fieldValues: {
				property_address: "Corniche District, Al Khobar",
				asking_price_sar: 1200000,
				agreed_price_sar: 1150000,
				commission_pct: 3,
				ejar_contract_number: "EJAR-2026-0405-5566",
				sakani_reference: "SAK-2026-EAS-0405",
				lease_start_date: Date.now() - 1 * DAY_MS,
				lease_expiry_date: Date.now() + 364 * DAY_MS,
			},
			tags: ["Off-plan"],
		},
		{
			title: "Olaya Apartment — Active Tenancy",
			stageCode: "WON",
			value: 95000,
			contactDisplayName: "Imran Khan (expat)",
			fieldValues: {
				property_address: "Olaya District, Riyadh",
				asking_price_sar: 100000,
				agreed_price_sar: 95000,
				commission_pct: 5,
				ejar_contract_number: "EJAR-2026-0301-9988",
				sakani_reference: "SAK-2026-RIY-0301",
				lease_start_date: Date.now() - 30 * DAY_MS,
				lease_expiry_date: Date.now() + 335 * DAY_MS,
			},
			tags: ["Renewal upcoming"],
		},
		{
			title: "Diplomatic Quarter — New Inquiry",
			stageCode: "NEW",
			value: 5500000,
			fieldValues: {
				property_address: "Diplomatic Quarter, Riyadh",
				asking_price_sar: 5500000,
			},
			tags: ["Hot inquiry", "VIP client"],
		},
	],
	notes: [
		{
			content: "Khalid wants to view Al Malqa villa Saturday 5pm. Confirmed.",
			categoryName: "Today",
			anchorTo: { kind: "lead", displayName: "Khalid Al-Saud" },
		},
		{
			content: "Fatimah needs Sakani-approved property — narrow listings to those.",
			categoryName: "Hot Inquiry",
			anchorTo: { kind: "lead", displayName: "Fatimah Al-Rashid" },
		},
		{
			content: "Ejar registration submitted — awaiting REGA confirmation.",
			categoryName: "Documents Pending",
			anchorTo: { kind: "deal", title: "Al Hamra Apartment — Annual Lease" },
		},
		{
			content: "Yousef pre-approved up to SAR 4M. Ready to make offer.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "Al Malqa Villa — 4BR Sale" },
		},
		{
			content:
				"Imran Khan (expat) — Iqama on file, Khobar deal closing this week. Schedule handover walkthrough.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Khobar Corniche — Handover" },
		},
		{
			content:
				"Olaya tenancy active — 30-day renewal notice window opens 60 days from now. Set reminder.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Olaya Apartment — Active Tenancy" },
		},
	],
	tasks: [
		{
			title: "Al Malqa villa viewing — Khalid",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Khalid Al-Saud" },
		},
		{
			title: "Follow up on Ejar registration status",
			dueOffsetDays: 2,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "Al Hamra Apartment — Annual Lease" },
		},
		{
			title: "Send Sakani-eligible properties to Fatimah",
			dueOffsetDays: 1,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Fatimah Al-Rashid" },
		},
		{
			title: "Khobar handover walkthrough — Imran",
			dueOffsetDays: 3,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Khobar Corniche — Handover" },
		},
		{
			title: "Olaya renewal — 30-day reminder window opens",
			dueOffsetDays: 60,
			priority: "normal",
			source: "followup",
			anchorTo: { kind: "deal", title: "Olaya Apartment — Active Tenancy" },
		},
	],
};
