/**
 * Shared types for the dashboard cards.
 *
 * The dashboard fetches `api.orgs.queries.getDashboardStats` ONCE at the
 * top of `DashboardHomeView`. The shape returned is propagated to each
 * card via props — no card calls `useQuery` directly. This file mirrors
 * the server return type so card props are precise without depending on
 * the Convex generated types (which would couple every card to the API
 * surface).
 */

export interface ActivityItem {
	action: string;
	description?: string;
	createdAt: number;
	actorType: string;
}

export interface DashboardStats {
	orgName: string;
	industry: string;
	plan: string;
	memberCount: number;
	leadCount: number;
	contactCount: number;
	dealCount: number;
	pipelineValue: number;
	dealsWon: number;
	dealsLost: number;
	companiesCount: number;
	currency: string;
	remindersDueToday: number;
	recentActivity: ActivityItem[];
}
