"use client";

import {
	createContext, useContext, useRef, useState,
	useCallback, useEffect, type ReactNode,
} from "react";

type NavSlotContextValue = {
	/** Subscribe to slot changes — returns unsubscribe fn */
	subscribe: (cb: () => void) => () => void;
	/** Get current slot node */
	getSlot: () => ReactNode;
	/** Set slot — does NOT trigger provider re-render */
	setSlot: (node: ReactNode) => void;
	clearSlot: () => void;
};

const NavSlotContext = createContext<NavSlotContextValue | null>(null);

/**
 * NavSlotProvider — stores slot in a ref (no setState) so setting the slot
 * never re-renders the provider tree. Consumers subscribe via a pub/sub pattern.
 */
export function NavSlotProvider({ children }: { children: ReactNode }) {
	const slotRef = useRef<ReactNode>(null);
	const listenersRef = useRef<Set<() => void>>(new Set());

	const subscribe = useCallback((cb: () => void) => {
		listenersRef.current.add(cb);
		return () => listenersRef.current.delete(cb);
	}, []);

	const getSlot = useCallback(() => slotRef.current, []);

	const setSlot = useCallback((node: ReactNode) => {
		slotRef.current = node;
		listenersRef.current.forEach((cb) => cb());
	}, []);

	const clearSlot = useCallback(() => {
		slotRef.current = null;
		listenersRef.current.forEach((cb) => cb());
	}, []);

	return (
		<NavSlotContext.Provider value={{ subscribe, getSlot, setSlot, clearSlot }}>
			{children}
		</NavSlotContext.Provider>
	);
}

function useNavSlotContextInternal() {
	const ctx = useContext(NavSlotContext);
	if (!ctx) throw new Error("Must be inside NavSlotProvider");
	return ctx;
}

/**
 * useNavSlot — used by pages to inject content into the TopNav middle area.
 * Pass a stable ReactNode; it will NOT cause re-renders in the provider.
 */
export function useNavSlot() {
	const { setSlot, clearSlot } = useNavSlotContextInternal();
	return { setSlot, clearSlot };
}

/**
 * useNavSlotNode — used by TopNav to read and re-render when slot changes.
 */
export function useNavSlotNode(): ReactNode {
	const { subscribe, getSlot } = useNavSlotContextInternal();
	const [, forceUpdate] = useState(0);

	useEffect(() => {
		return subscribe(() => forceUpdate((n) => n + 1));
	}, [subscribe]);

	return getSlot();
}
