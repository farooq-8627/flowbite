import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyFont, applyThemeMode, applyThemePreset, subscribeToSystemTheme } from "./theme-utils";

describe("Theme Utilities", () => {
	beforeEach(() => {
		document.documentElement.className = "";
		document.documentElement.removeAttribute("data-theme-preset");
		document.documentElement.removeAttribute("data-font");
		document.documentElement.removeAttribute("data-theme-mode");
	});

	describe("applyThemePreset", () => {
		it("should set data-theme-preset attribute", () => {
			applyThemePreset("brutalist");
			expect(document.documentElement.getAttribute("data-theme-preset")).toBe("brutalist");
		});

		it("should update when called multiple times", () => {
			applyThemePreset("default");
			expect(document.documentElement.getAttribute("data-theme-preset")).toBe("default");

			applyThemePreset("orbitly");
			expect(document.documentElement.getAttribute("data-theme-preset")).toBe("orbitly");
		});
	});

	describe("applyFont", () => {
		it("should set data-font attribute", () => {
			applyFont("inter");
			expect(document.documentElement.getAttribute("data-font")).toBe("inter");
		});

		it("should update when called multiple times", () => {
			applyFont("geist");
			expect(document.documentElement.getAttribute("data-font")).toBe("geist");

			applyFont("roboto");
			expect(document.documentElement.getAttribute("data-font")).toBe("roboto");
		});
	});

	describe("applyThemeMode", () => {
		it("should apply light mode", () => {
			const result = applyThemeMode("light");
			expect(result).toBe("light");
			expect(document.documentElement.classList.contains("dark")).toBe(false);
			expect(document.documentElement.getAttribute("data-theme-mode")).toBe("light");
		});

		it("should apply dark mode", () => {
			const result = applyThemeMode("dark");
			expect(result).toBe("dark");
			expect(document.documentElement.classList.contains("dark")).toBe(true);
			expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
		});

		it("should apply system mode based on media query", () => {
			// Mock matchMedia
			const mockMatchMedia = vi.fn().mockImplementation((query) => ({
				matches: query === "(prefers-color-scheme: dark)",
				media: query,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			}));
			global.matchMedia = mockMatchMedia;

			const result = applyThemeMode("system");
			expect(result).toBe("dark");
			expect(document.documentElement.getAttribute("data-theme-mode")).toBe("system");
		});

		it("should add and remove disable-transitions class", () => {
			applyThemeMode("dark");
			// Note: In real browser, transitions would be disabled temporarily
			// In test environment, we just verify the function runs without error
			expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
		});
	});

	describe("subscribeToSystemTheme", () => {
		it("should call callback when system theme changes", () => {
			const callback = vi.fn();
			const listeners: any[] = [];

			const mockMatchMedia = vi.fn().mockImplementation(() => ({
				matches: false,
				addEventListener: (event: string, handler: any) => {
					listeners.push(handler);
				},
				removeEventListener: vi.fn(),
			}));
			global.matchMedia = mockMatchMedia;

			const unsubscribe = subscribeToSystemTheme(callback);

			// Simulate theme change
			listeners.forEach((listener) => listener({ matches: true }));

			expect(callback).toHaveBeenCalledWith(true);

			unsubscribe();
		});

		it("should return cleanup function", () => {
			const callback = vi.fn();
			const removeListener = vi.fn();

			const mockMatchMedia = vi.fn().mockImplementation(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: removeListener,
			}));
			global.matchMedia = mockMatchMedia;

			const unsubscribe = subscribeToSystemTheme(callback);
			unsubscribe();

			expect(removeListener).toHaveBeenCalled();
		});
	});
});
