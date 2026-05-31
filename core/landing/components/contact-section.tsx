"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Mail, MessageSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
	CONTACT_INTERESTS,
	type ContactInput,
	contactSchema,
} from "@/core/landing/lib/contact-schema";
import { BRAND } from "@/core/landing/lib/content";
import { toast } from "@/lib/toast";

export function ContactSection() {
	const submit = useMutation(api.contact.submit);
	const form = useForm<ContactInput>({
		resolver: zodResolver(contactSchema),
		defaultValues: {
			name: "",
			email: "",
			company: "",
			interest: "product",
			message: "",
			website: "",
		},
	});

	async function onSubmit(values: ContactInput) {
		try {
			const res = await submit({
				name: values.name,
				email: values.email,
				company: values.company || undefined,
				interest: values.interest,
				message: values.message,
				website: values.website || undefined,
			});
			if (res?.ok) {
				toast.success("Thanks! We'll get back to you shortly.");
				form.reset();
			} else {
				toast.error("Something went wrong. Please try again.");
			}
		} catch (err) {
			toast.mutationError(err, "Could not send your message. Please try again.");
		}
	}

	return (
		<section id="contact" className="scroll-mt-20 py-24 sm:py-32">
			<div className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-5">
					{/* Left — pitch */}
					<div className="lg:col-span-2">
						<Badge variant="outline" className="mb-4">
							Contact
						</Badge>
						<h2 className="text-balance font-bold text-3xl tracking-tight sm:text-4xl">
							Let's build the right fit for your business
						</h2>
						<p className="mt-4 text-pretty text-muted-foreground">
							Want to try {BRAND}, migrate from another CRM, or have us build
							something custom? Tell us what you're working on and we'll reply
							personally.
						</p>
						<ul className="mt-6 space-y-4 text-sm">
							<li className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
									<MessageSquare className="size-4" />
								</span>
								We answer every enquiry ourselves — no bots.
							</li>
							<li className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
									<Mail className="size-4" />
								</span>
								Custom CRM, website, or data migration — just ask.
							</li>
						</ul>
					</div>

					{/* Right — form */}
					<div className="lg:col-span-3">
						<Card>
							<CardContent>
								<Form {...form}>
									<form
										onSubmit={form.handleSubmit(onSubmit)}
										className="space-y-5"
									>
										<div className="grid gap-5 sm:grid-cols-2">
											<FormField
												control={form.control}
												name="name"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Name</FormLabel>
														<FormControl>
															<Input
																placeholder="Jane Doe"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="email"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Email</FormLabel>
														<FormControl>
															<Input
																type="email"
																placeholder="jane@company.com"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<div className="grid gap-5 sm:grid-cols-2">
											<FormField
												control={form.control}
												name="company"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Company (optional)</FormLabel>
														<FormControl>
															<Input
																placeholder="Acme Inc."
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="interest"
												render={({ field }) => (
													<FormItem>
														<FormLabel>I'm interested in</FormLabel>
														<Select
															value={field.value}
															onValueChange={field.onChange}
														>
															<FormControl>
																<SelectTrigger className="w-full">
																	<SelectValue />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{CONTACT_INTERESTS.map((option) => (
																	<SelectItem
																		key={option.value}
																		value={option.value}
																	>
																		{option.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>

										<FormField
											control={form.control}
											name="message"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Message</FormLabel>
													<FormControl>
														<Textarea
															rows={6}
															placeholder="Tell us about your business and what you need..."
															className="min-h-32"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										{/* Honeypot — hidden from real users. */}
										<FormField
											control={form.control}
											name="website"
											render={({ field }) => (
												<input
													{...field}
													type="text"
													tabIndex={-1}
													autoComplete="off"
													aria-hidden="true"
													className="hidden"
												/>
											)}
										/>

										<Button
											type="submit"
											className="w-full"
											disabled={form.formState.isSubmitting}
										>
											{form.formState.isSubmitting
												? "Sending..."
												: "Send message"}
										</Button>
									</form>
								</Form>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</section>
	);
}
