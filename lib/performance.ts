import type { ComponentType } from "react";
import { memo } from "react";

/**
 * Performance optimization utilities
 *
 * Use these to wrap expensive components that don't need to re-render often
 */

/**
 * Memoize a component with custom comparison
 * @param Component - Component to memoize
 * @param propsAreEqual - Custom comparison function (optional)
 */
export function memoize<P extends object>(
	Component: ComponentType<P>,
	propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
) {
	return memo(Component, propsAreEqual);
}

/**
 * Shallow comparison for props (default React.memo behavior)
 */
export function shallowEqual<T extends object>(prev: T, next: T): boolean {
	const prevKeys = Object.keys(prev) as Array<keyof T>;
	const nextKeys = Object.keys(next) as Array<keyof T>;

	if (prevKeys.length !== nextKeys.length) {
		return false;
	}

	for (const key of prevKeys) {
		if (prev[key] !== next[key]) {
			return false;
		}
	}

	return true;
}

/**
 * Deep comparison for complex props
 */
export function deepEqual(prev: any, next: any): boolean {
	if (prev === next) return true;
	if (prev == null || next == null) return false;
	if (typeof prev !== "object" || typeof next !== "object") return false;

	const prevKeys = Object.keys(prev);
	const nextKeys = Object.keys(next);

	if (prevKeys.length !== nextKeys.length) return false;

	for (const key of prevKeys) {
		if (!nextKeys.includes(key)) return false;
		if (!deepEqual(prev[key], next[key])) return false;
	}

	return true;
}

/**
 * Debounce function for expensive operations
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;

	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			timeout = null;
			func(...args);
		};

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(later, wait);
	};
}

/**
 * Throttle function for frequent events
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number,
): (...args: Parameters<T>) => void {
	let inThrottle: boolean = false;

	return function executedFunction(...args: Parameters<T>) {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => {
				inThrottle = false;
			}, limit);
		}
	};
}
