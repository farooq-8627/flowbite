/**
 * Mock data for the General Real Estate template.
 *
 * Pipeline: NEW → VIEW → OFR → NEG → CONT → WON | LOST.
 *
 * Field coverage:
 *   - Lead: property_type, intent, bedrooms, preferred_area, budget.
 *   - Deal: property_address, property_type, asking_price (always);
 *     agreed_price + commission_pct (OFR+); closing_date (CONT+).
 *
 * One deal per stage so the board lights up fully on first signin.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const realEstateMockData: MockDataSeed = {
	companies: [
		{
			key: "bay-area-realty",
			name: "Bay Area Realty Group",
			industry: "Real Estate",
			website: "https://bayarearealty.example.com",
		},
		{
			key: "shoreditch-lettings",
			name: "Shoreditch Lettings",
			industry: "Real Estate",
			website: "https://shoreditch.example.com",
		},
	],
	leads: [
		{
			displayName: "Maria Rodriguez",
			email: "maria.r@example.com",
			phone: "+1 415 555 0101",
			status: "new",
			fieldValues: {
				property_type: "House",
				intent: "Buy",
				bedrooms: "3",
				preferred_area: "Mission District, San Francisco",
				budget: 1200000,
			},
			tags: ["Cash buyer", "Hot inquiry"],
		},
		{
			displayName: "James O'Connor",
			email: "j.oconnor@example.com",
			phone: "+44 20 7946 0123",
			status: "contacted",
			fieldValues: {
				property_type: "Apartment",
				intent: "Rent",
				bedrooms: "1",
				preferred_area: "Shoreditch, London",
				budget: 2500,
			},
			tags: ["End user"],
		},
		{
			displayName: "Yuki Tanaka",
			email: "yuki.t@example.com",
			phone: "+1 650 555 0190",
			status: "new",
			fieldValues: {
				property_type: "Condo",
				intent: "Buy",
				bedrooms: "2",
				preferred_area: "Palo Alto, CA",
				budget: 1800000,
			},
			tags: ["Investor"],
		},
		{
			displayName: "Lena Müller",
			email: "lena.m@example.com",
			phone: "+49 30 555 0124",
			status: "new",
			fieldValues: {
				property_type: "Apartment",
				intent: "Buy",
				bedrooms: "2",
				preferred_area: "Berlin Mitte",
				budget: 650000,
			},
			tags: ["Mortgage required", "End user"],
		},
	],
	contacts: [
		{
			displayName: "Sofia Martinez",
			email: "sofia@example.com",
			phone: "+1 213 555 0199",
			companyKey: "bay-area-realty",
			tags: ["VIP client"],
		},
		{
			displayName: "Ben Holloway",
			email: "ben.h@example.com",
			phone: "+44 7700 900 012",
			companyKey: "shoreditch-lettings",
			tags: ["Cash buyer"],
		},
		{
			displayName: "Aisha Bakr",
			email: "aisha@example.com",
			phone: "+1 213 555 0145",
			companyKey: "bay-area-realty",
			tags: ["Investor"],
		},
	],
	deals: [
		{
			title: "Mission St — 3BR Family Home",
			stageCode: "VIEW",
			value: 1150000,
			contactDisplayName: "Sofia Martinez",
			companyKey: "bay-area-realty",
			fieldValues: {
				property_address: "1247 Mission St, San Francisco, CA",
				property_type: "House",
				asking_price: 1200000,
			},
			tags: ["Hot inquiry"],
		},
		{
			title: "Shoreditch Studio — 1BR Rental",
			stageCode: "OFR",
			value: 2400,
			contactDisplayName: "Ben Holloway",
			companyKey: "shoreditch-lettings",
			fieldValues: {
				property_address: "42 Bethnal Green Rd, Shoreditch, London",
				property_type: "Apartment",
				asking_price: 2500,
				agreed_price: 2400,
				commission_pct: 8,
			},
			tags: ["Cash buyer"],
		},
		{
			title: "Palo Alto Investor Condo",
			stageCode: "NEG",
			value: 1750000,
			contactDisplayName: "Aisha Bakr",
			companyKey: "bay-area-realty",
			fieldValues: {
				property_address: "201 Lytton Ave, Palo Alto, CA",
				property_type: "Condo",
				asking_price: 1800000,
				agreed_price: 1750000,
				commission_pct: 2.5,
			},
			tags: ["Investor"],
		},
		{
			title: "Mission Bay Townhouse — Under Contract",
			stageCode: "CONT",
			value: 1450000,
			contactDisplayName: "Sofia Martinez",
			companyKey: "bay-area-realty",
			fieldValues: {
				property_address: "88 Berry St, San Francisco, CA",
				property_type: "Townhouse",
				asking_price: 1500000,
				agreed_price: 1450000,
				commission_pct: 2.5,
				closing_date: Date.now() + 21 * DAY_MS,
			},
			tags: ["Hot inquiry", "VIP client"],
		},
		{
			title: "Sunset District 4BR — Closed Won",
			stageCode: "WON",
			value: 2100000,
			contactDisplayName: "Aisha Bakr",
			companyKey: "bay-area-realty",
			fieldValues: {
				property_address: "1932 Quintara St, San Francisco, CA",
				property_type: "House",
				asking_price: 2200000,
				agreed_price: 2100000,
				commission_pct: 2.5,
				closing_date: Date.now() - 7 * DAY_MS,
			},
			tags: ["VIP client"],
		},
		{
			title: "Mid-market loft — Lost",
			stageCode: "LOST",
			value: 950000,
			fieldValues: {
				property_address: "55 9th St, San Francisco, CA",
				property_type: "Apartment",
				asking_price: 1000000,
				agreed_price: 950000,
				commission_pct: 2.5,
			},
		},
		{
			title: "Berlin Mitte 2BR — New Inquiry",
			stageCode: "NEW",
			value: 650000,
			fieldValues: {
				property_address: "Linienstr 14, 10119 Berlin",
				property_type: "Apartment",
				asking_price: 650000,
			},
			tags: ["Mortgage required"],
		},
	],
	notes: [
		{
			content:
				"Maria is pre-approved up to $1.2M and looking to close before end of quarter. Schedule viewing Saturday AM.",
			categoryName: "Hot Inquiry",
			anchorTo: { kind: "lead", displayName: "Maria Rodriguez" },
		},
		{
			content:
				"James prefers viewings on weekends only. Needs service charge breakdown + broadband speed before committing.",
			categoryName: "Today",
			anchorTo: { kind: "lead", displayName: "James O'Connor" },
		},
		{
			content:
				"Counter-offer at £2,400/month accepted by landlord (Ben). Send tenancy agreement draft.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Shoreditch Studio — 1BR Rental" },
		},
		{
			content:
				"Sunset 4BR closed last week — write retro + reach out for referral testimony.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Sunset District 4BR — Closed Won" },
		},
		{
			content:
				"Mission Bay townhouse under contract — schedule walkthrough + keys handover with Sofia.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Mission Bay Townhouse — Under Contract" },
		},
	],
	tasks: [
		{
			title: "Send Mission St listing photos to Maria",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Maria Rodriguez" },
		},
		{
			title: "Lease signing — Shoreditch",
			dueOffsetDays: 3,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Shoreditch Studio — 1BR Rental" },
		},
		{
			title: "Call Yuki — Palo Alto condo shortlist",
			dueOffsetDays: 1,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Yuki Tanaka" },
		},
		{
			title: "Lena — schedule Berlin Mitte viewing",
			dueOffsetDays: 2,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Lena Müller" },
		},
		{
			title: "Mission Bay closing prep — paperwork review",
			dueOffsetDays: 5,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Mission Bay Townhouse — Under Contract" },
		},
	],
};
