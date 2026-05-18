"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resetAllTours } from "@/components/ui/first-time-tour";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCurrentOrg, useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { type FontKey, fontOptions } from "@/lib/fonts/registry";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import { applySidebarCollapsible, applySidebarVariant } from "@/lib/preferences/layout-utils";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { applyFont, applyThemePreset } from "@/lib/preferences/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSection } from "../shared/SettingsSection";
import { UserEntityDefaultsSection } from "./appearance/UserEntityDefaultsSection";

export function AppearanceGroup() {
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
	const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
	const theme_preset = usePreferencesStore((s) => s.theme_preset);
	const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
	const font = usePreferencesStore((s) => s.font);
	const setFont = usePreferencesStore((s) => s.setFont);
	const radius = usePreferencesStore((s) => s.radius);
	const setRadius = usePreferencesStore((s) => s.setRadius);
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant);
	const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);
	const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible);

	// Resolve the current org + user from the shared `OrgProvider` context —
	// no extra `listMyOrgs` / `users.getCurrent` subscriptions. Per AGENTS.md
	// "Identity/auth/labels via context, not subscriptions".
	const { orgId } = useCurrentOrg();
	const me = useMe();
	const userId = me?._id;

	const persist =
		<K extends string>(
			setter: (v: K) => void,
			key: Parameters<typeof persistPreference>[0],
			apply?: (v: K) => void,
		) =>
		(v: K | "") => {
			if (!v) return;
			setter(v);
			apply?.(v);
			void persistPreference(key, v);
		};

	const handleRestore = () => {
		persist<ThemePreset>(
			setThemePreset,
			"theme_preset",
			applyThemePreset,
		)(PREFERENCE_DEFAULTS.theme_preset);
		persist<ThemeMode>(setThemeMode, "theme_mode")(PREFERENCE_DEFAULTS.theme_mode);
		persist<FontKey>(setFont, "font", applyFont)(PREFERENCE_DEFAULTS.font as FontKey);
		persist<string>(setRadius, "radius")(PREFERENCE_DEFAULTS.radius);
		persist<SidebarVariant>(
			setSidebarVariant,
			"sidebar_variant",
			applySidebarVariant,
		)(PREFERENCE_DEFAULTS.sidebar_variant);
		persist<SidebarCollapsible>(
			setSidebarCollapsible,
			"sidebar_collapsible",
			applySidebarCollapsible,
		)(PREFERENCE_DEFAULTS.sidebar_collapsible);
	};

	return (
		<div className="grid gap-6">
			<SettingsSection
				id="appearance.theme"
				title="Theme"
				description="Choose your color scheme and preset."
			>
				<SettingsRow label="Theme mode" description="Light, dark, or match your system.">
					<ToggleGroup
						size="sm"
						variant="outline"
						type="single"
						value={theme_mode}
						onValueChange={persist<ThemeMode>(setThemeMode, "theme_mode")}
						className="w-full"
					>
						<ToggleGroupItem value="light" className="flex-1">
							Light
						</ToggleGroupItem>
						<ToggleGroupItem value="dark" className="flex-1">
							Dark
						</ToggleGroupItem>
						<ToggleGroupItem value="system" className="flex-1">
							System
						</ToggleGroupItem>
					</ToggleGroup>
				</SettingsRow>

				<SettingsRow
					label="Color preset"
					description="Primary accent color used across buttons and links."
				>
					<Select
						value={theme_preset}
						onValueChange={persist<ThemePreset>(
							setThemePreset,
							"theme_preset",
							applyThemePreset,
						)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select preset" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{THEME_PRESET_OPTIONS.map((p) => (
									<SelectItem key={p.value} value={p.value}>
										<span
											className="me-2 inline-block size-2.5 rounded-full"
											style={{
												backgroundColor:
													(resolvedThemeMode ?? "light") === "dark"
														? p.primary.dark
														: p.primary.light,
											}}
										/>
										{p.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				id="appearance.layout"
				title="Layout"
				description="Font, border radius, and sidebar behavior."
				action={
					<Button type="button" variant="outline" size="sm" onClick={handleRestore}>
						Restore defaults
					</Button>
				}
			>
				<SettingsRow label="Font" description="Used throughout the app and emails.">
					<Select
						value={font}
						onValueChange={persist<FontKey>(setFont, "font", applyFont)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select font" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{fontOptions.map((f) => (
									<SelectItem key={f.key} value={f.key}>
										{f.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</SettingsRow>

				<SettingsRow
					label="Border radius"
					description="Roundedness of buttons, inputs, and cards."
				>
					<ToggleGroup
						size="sm"
						variant="outline"
						type="single"
						value={radius}
						onValueChange={persist<string>(setRadius, "radius")}
						className="w-full"
					>
						{["0", "0.3", "0.5", "0.75", "1.0"].map((v) => (
							<ToggleGroupItem key={v} value={v} className="flex-1">
								{v}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</SettingsRow>

				<SettingsRow
					label="Sidebar style"
					description="Visual style of the left navigation."
				>
					<ToggleGroup
						size="sm"
						variant="outline"
						type="single"
						value={sidebar_variant}
						onValueChange={persist<SidebarVariant>(
							setSidebarVariant,
							"sidebar_variant",
							applySidebarVariant,
						)}
						className="w-full"
					>
						<ToggleGroupItem value="inset" className="flex-1">
							Inset
						</ToggleGroupItem>
						<ToggleGroupItem value="sidebar" className="flex-1">
							Sidebar
						</ToggleGroupItem>
						<ToggleGroupItem value="floating" className="flex-1">
							Floating
						</ToggleGroupItem>
					</ToggleGroup>
				</SettingsRow>

				<SettingsRow
					label="Sidebar collapse"
					description="How the sidebar behaves when collapsed."
				>
					<ToggleGroup
						size="sm"
						variant="outline"
						type="single"
						value={sidebar_collapsible}
						onValueChange={persist<SidebarCollapsible>(
							setSidebarCollapsible,
							"sidebar_collapsible",
							applySidebarCollapsible,
						)}
						className="w-full"
					>
						<ToggleGroupItem value="icon" className="flex-1">
							Icon
						</ToggleGroupItem>
						<ToggleGroupItem value="offcanvas" className="flex-1">
							Off-canvas
						</ToggleGroupItem>
					</ToggleGroup>
				</SettingsRow>
			</SettingsSection>

			{orgId && userId && (
				<SettingsSection
					id="appearance.default-views"
					title="Default views"
					description="Override the workspace default view for each entity. Applies only to your account."
				>
					<UserEntityDefaultsSection
						orgId={orgId}
						userId={userId}
						currentPreferences={
							me?.preferences?.entityDefaultView as
								| Record<string, "list" | "board">
								| undefined
						}
					/>
				</SettingsSection>
			)}

			<SettingsSection
				id="appearance.tutorials"
				title="Tutorials"
				description="Show the first-time coachmarks again on this device."
			>
				<SettingsRow
					label="Replay tutorials"
					description="Restart the one-time guides that appear on the kanban board, settings, and other power features."
				>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							resetAllTours();
							toast.success("Tutorials reset", {
								description:
									"Open any module to see its coachmarks again on next visit.",
							});
						}}
					>
						Replay
					</Button>
				</SettingsRow>
			</SettingsSection>
		</div>
	);
}
