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
	/**
	 * Convex doc id. Required for React keys — composite tuples
	 * (`createdAt-action-entityType-entityId`) collide when two
	 * `activityLogs` rows land in the same millisecond on the same
	 * entity (e.g. multi-field bulk edits each emit their own
	 * `field_updated` row inside a single transaction). The doc id is
	 * the only guaranteed-unique handle.
	 */
	_id: string;
	action: string;
	description?: string;
	createdAt: number;
	actorType: string;
	/**
	 * Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29) — widened to expose
	 * the actor + entity context the new `<RecentActivityWidget>` needs
	 * for avatar resolution + deep-linking. Server already returns these
	 * fields on every `activityLogs` row read from `getDashboardStats`;
	 * the type just stops narrowing them away.
	 */
	userId: string;
	entityType: string;
	entityId: string;
	personCode?: string;
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
	tasksDueToday: number;
	tasksOverdue: number;
	tasksDoneThisWeek: number;
	recentActivity: ActivityItem[];
}
