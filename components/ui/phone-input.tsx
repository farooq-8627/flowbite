"use client";

/**
 * PhoneInput — international phone input with country dropdown + flag + search.
 *
 * Built on top of `react-phone-number-input` (catamphetamine/react-phone-number-input)
 * which handles E.164 formatting + per-country validation. Styled to match our
 * shadcn components so it drops into any drawer/form cleanly.
 *
 * Usage:
 *   <PhoneInput value={phone} onChange={setPhone} defaultCountry="AE" />
 *
 * Value is always an E.164 string (`+971501234567`) or empty.
 * The country selector popover has a search input for fast retrieval.
 */

import { CheckIcon, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PhoneInputProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "ref"> &
	Omit<RPNInput.Props<typeof RPNInput.default>, "onChange"> & {
		onChange?: (value: string) => void;
	};

const PhoneInput = React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
	({ className, onChange, ...props }, ref) => (
		<RPNInput.default
			ref={ref}
			className={cn("flex", className)}
			flagComponent={FlagComponent}
			countrySelectComponent={CountrySelect}
			inputComponent={InputComponent}
			smartCaret
			onChange={(value) => onChange?.(value ?? "")}
			{...props}
		/>
	),
);
PhoneInput.displayName = "PhoneInput";

const InputComponent = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
	({ className, ...props }, ref) => (
		<Input
			className={cn("h-9 rounded-s-none rounded-e-[var(--radius)]", className)}
			{...props}
			ref={ref}
		/>
	),
);
InputComponent.displayName = "PhoneInputField";

type CountryEntry = { label: string; value: RPNInput.Country | undefined };

type CountrySelectProps = {
	disabled?: boolean;
	value: RPNInput.Country;
	options: CountryEntry[];
	onChange: (country: RPNInput.Country) => void;
};

function CountrySelect({ disabled, value: selected, options, onChange }: CountrySelectProps) {
	const [open, setOpen] = React.useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="flex h-9 gap-1 rounded-e-none rounded-s-[var(--radius)] border-e-0 px-2"
					disabled={disabled}
					aria-label="Select country code"
				>
					<FlagComponent country={selected} countryName={selected} />
					<ChevronsUpDown
						className={cn("size-3 opacity-50", disabled ? "hidden" : "opacity-100")}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[300px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search country…" />
					<CommandList>
						<CommandEmpty>No country found.</CommandEmpty>
						<CommandGroup>
							{options
								.filter((o) => o.value)
								.map((option) => {
									const country = option.value as RPNInput.Country;
									return (
										<CommandItem
											key={country}
											className="gap-2"
											onSelect={() => {
												onChange(country);
												setOpen(false);
											}}
										>
											<FlagComponent
												country={country}
												countryName={option.label}
											/>
											<span className="flex-1 truncate text-sm">
												{option.label}
											</span>
											<span className="text-xs text-muted-foreground">
												+{RPNInput.getCountryCallingCode(country)}
											</span>
											<CheckIcon
												className={cn(
													"ms-auto size-4 shrink-0",
													country === selected
														? "opacity-100"
														: "opacity-0",
												)}
											/>
										</CommandItem>
									);
								})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function FlagComponent({ country, countryName }: RPNInput.FlagProps) {
	const Flag = flags[country];
	return (
		<span className="inline-flex size-4 overflow-hidden rounded-[2px] bg-muted">
			{Flag ? <Flag title={countryName} /> : null}
		</span>
	);
}

export { PhoneInput };
