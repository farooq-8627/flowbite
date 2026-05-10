"use client";

import { SettingsSection } from "../shared/SettingsSection";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { applyThemePreset, applyFont } from "@/lib/preferences/theme-utils";
import { applySidebarCollapsible, applySidebarVariant } from "@/lib/preferences/layout-utils";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import { fontOptions, type FontKey } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";

export function AppearanceGroup() {
	const theme_mode           = usePreferencesStore((s) => s.theme_mode);
	const setThemeMode         = usePreferencesStore((s) => s.setThemeMode);
	const resolvedThemeMode    = usePreferencesStore((s) => s.resolvedThemeMode);
	const theme_preset         = usePreferencesStore((s) => s.theme_preset);
	const setThemePreset       = usePreferencesStore((s) => s.setThemePreset);
	const font                 = usePreferencesStore((s) => s.font);
	const setFont              = usePreferencesStore((s) => s.setFont);
	const radius               = usePreferencesStore((s) => s.radius);
	const setRadius            = usePreferencesStore((s) => s.setRadius);
	const sidebar_variant      = usePreferencesStore((s) => s.sidebar_variant);
	const setSidebarVariant    = usePreferencesStore((s) => s.setSidebarVariant);
	const sidebar_collapsible  = usePreferencesStore((s) => s.sidebar_collapsible);
	const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible);

	const set = <K extends string>(
		setter: (v: K) => void,
		key: string,
		apply?: (v: K) => void,
	) => (v: K | "") => {
		if (!v) return;
		setter(v);
		apply?.(v);
		void persistPreference(key as Parameters<typeof persistPreference>[0], v);
	};

	const handleRestore = () => {
		set<ThemePreset>(setThemePreset, "theme_preset", applyThemePreset)(PREFERENCE_DEFAULTS.theme_preset);
		set<ThemeMode>(setThemeMode, "theme_mode")(PREFERENCE_DEFAULTS.theme_mode);
		set<FontKey>(setFont, "font", applyFont)(PREFERENCE_DEFAULTS.font as FontKey);
		set<string>(setRadius, "radius")(PREFERENCE_DEFAULTS.radius);
		set<SidebarVariant>(setSidebarVariant, "sidebar_variant", applySidebarVariant)(PREFERENCE_DEFAULTS.sidebar_variant);
		set<SidebarCollapsible>(setSidebarCollapsible, "sidebar_collapsible", applySidebarCollapsible)(PREFERENCE_DEFAULTS.sidebar_collapsible);
	};

	return (
		<div className="grid gap-6">
			{/* Theme */}
			<SettingsSection
				id="appearance.theme"
				title="Theme"
				description="Choose your color scheme and dark mode preference."
			>
				<div className="grid gap-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1">
					<div className="grid gap-2">
						<Label>Theme mode</Label>
						<ToggleGroup size="sm" variant="outline" type="single" value={theme_mode}
							onValueChange={set<ThemeMode>(setThemeMode, "theme_mode")}>
							<ToggleGroupItem value="light">Light</ToggleGroupItem>
							<ToggleGroupItem value="dark">Dark</ToggleGroupItem>
							<ToggleGroupItem value="system">System</ToggleGroupItem>
						</ToggleGroup>
					</div>

					<div className="grid gap-2">
						<Label>Color preset</Label>
						<Select value={theme_preset} onValueChange={set<ThemePreset>(setThemePreset, "theme_preset", applyThemePreset)}>
							<SelectTrigger size="sm" className="w-full">
								<SelectValue placeholder="Select preset" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{THEME_PRESET_OPTIONS.map((p) => (
										<SelectItem key={p.value} value={p.value}>
											<span className="size-2.5 rounded-full inline-block me-1.5"
												style={{ backgroundColor: (resolvedThemeMode ?? "light") === "dark" ? p.primary.dark : p.primary.light }} />
											{p.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				</div>
			</SettingsSection>

			{/* Layout */}
			<SettingsSection
				id="appearance.layout"
				title="Layout"
				description="Customize font, border radius, and sidebar behavior."
				action={
					<Button type="button" variant="outline" size="sm" onClick={handleRestore}>
						Restore defaults
					</Button>
				}
			>
				<div className="grid gap-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1">
					<div className="grid gap-2">
						<Label>Font</Label>
						<Select value={font} onValueChange={set<FontKey>(setFont, "font", applyFont)}>
							<SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Select font" /></SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{fontOptions.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-2">
						<Label>Border radius</Label>
						<ToggleGroup size="sm" variant="outline" type="single" value={radius}
							onValueChange={set<string>(setRadius, "radius")}>
							{["0", "0.3", "0.5", "0.75", "1.0"].map((v) => (
								<ToggleGroupItem key={v} value={v}>{v}</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="grid gap-2">
						<Label>Sidebar style</Label>
						<ToggleGroup size="sm" variant="outline" type="single" value={sidebar_variant}
							onValueChange={set<SidebarVariant>(setSidebarVariant, "sidebar_variant", applySidebarVariant)}>
							<ToggleGroupItem value="inset">Inset</ToggleGroupItem>
							<ToggleGroupItem value="sidebar">Sidebar</ToggleGroupItem>
							<ToggleGroupItem value="floating">Floating</ToggleGroupItem>
						</ToggleGroup>
					</div>

					<div className="grid gap-2">
						<Label>Sidebar collapse</Label>
						<ToggleGroup size="sm" variant="outline" type="single" value={sidebar_collapsible}
							onValueChange={set<SidebarCollapsible>(setSidebarCollapsible, "sidebar_collapsible", applySidebarCollapsible)}>
							<ToggleGroupItem value="icon">Icon</ToggleGroupItem>
							<ToggleGroupItem value="offcanvas">Off-canvas</ToggleGroupItem>
						</ToggleGroup>
					</div>
				</div>
			</SettingsSection>
		</div>
	);
}
