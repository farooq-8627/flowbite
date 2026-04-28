/**
 * User data and types
 */

export interface User {
	name: string;
	email: string;
	avatar: string;
}

// Mock root user - replace with actual user data from Convex
export const rootUser: User = {
	name: "User",
	email: "user@example.com",
	avatar: "",
};
