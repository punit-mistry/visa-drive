"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CircleCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
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
import { useTodayIso } from "@/hooks/use-current-date";
import { TRAVEL_PURPOSES } from "@/lib/constants/countries";
import { LEGAL } from "@/lib/constants/site";
import { enquirySchema, type EnquiryFormValues } from "@/lib/validators/forms";

/**
 * Public enquiry form.
 *
 * Posts to `enquiries.submit`, the one unauthenticated mutation in the
 * backend, and shows the reference number it returns so the visitor has
 * something to quote when they call. Validation runs here for the error
 * messages; Convex re-validates independently.
 */
export function EnquiryForm() {
  const params = useSearchParams();
  const submit = useMutation(api.enquiries.submit);
  const [reference, setReference] = useState<string | null>(null);
  const today = useTodayIso();

  const prefillService = params.get("service") ?? "";
  const prefillDestination = params.get("destination") ?? "";
  const prefillVisa = params.get("visa") ?? "";

  const defaultSubject =
    prefillVisa && prefillDestination
      ? `${prefillVisa} — ${prefillDestination}`
      : prefillService || (prefillDestination ? `${prefillDestination} visa` : "");

  const form = useForm<EnquiryFormValues>({
    resolver: zodResolver(enquirySchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      interestedCountry: prefillDestination,
      visaCategory: "",
      subject: defaultSubject,
      message: "",
      consent: false as unknown as true,
    },
    mode: "onBlur",
  });

  async function onSubmit(values: EnquiryFormValues) {
    try {
      const result = await submit({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        interestedCountry: values.interestedCountry || undefined,
        visaCategory: values.visaCategory || undefined,
        travelDate: values.travelDate,
        subject: values.subject,
        message: values.message,
        source: "website_form",
      });

      setReference(result.referenceId);
      form.reset();
      toast.success("Enquiry received", {
        description: `Your reference is ${result.referenceId}.`,
      });
    } catch (error) {
      const message =
        error instanceof ConvexError
          ? ((error.data as { message?: string })?.message ??
            "We could not send that just now.")
          : "We could not send that just now. Please try again, or call us.";

      toast.error("Your enquiry was not sent", { description: message });
    }
  }

  if (reference) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 elev-md">
        <span className="inline-flex size-11 items-center justify-center rounded-xl border border-success/25 bg-success-soft text-success">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl">Thank you — we have your enquiry</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          One of our team will come back to you. Quote this reference if you call
          or message us in the meantime.
        </p>

        <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 font-mono text-lg font-semibold tracking-wide">
          {reference}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => setReference(null)}>
            Send another enquiry
          </Button>
          <Button asChild variant="ghost">
            <Link href="/destinations">Browse destinations</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="rounded-2xl border border-border bg-card p-6 sm:p-8 elev-md"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="name"
                    placeholder="As it appears on your passport"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+91 98765 43210"
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
              <FormItem className="sm:col-span-2">
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="interestedCountry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Country you are visiting{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="United Arab Emirates"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visaCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Purpose of travel{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a purpose" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TRAVEL_PURPOSES.map((purpose) => (
                      <SelectItem key={purpose.value} value={purpose.value}>
                        {purpose.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="travelDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Travel date{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={today || undefined}
                    value={
                      field.value
                        ? new Date(field.value).toISOString().slice(0, 10)
                        : ""
                    }
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (!raw) {
                        field.onChange(undefined);
                        return;
                      }
                      const parsed = Date.parse(`${raw}T00:00:00`);
                      field.onChange(Number.isNaN(parsed) ? undefined : parsed);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subject</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="What is this about?" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Your message</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={6}
                    placeholder="Tell us about your trip, your passport and anything that might affect the application."
                  />
                </FormControl>
                <FormDescription>
                  The more context you give us, the more useful our first reply
                  will be.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="consent"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-describedby="consent-description"
                      className="mt-0.5"
                    />
                  </FormControl>
                  <div className="space-y-1.5">
                    <FormLabel className="font-normal leading-relaxed">
                      I agree to VisaDrive contacting me about this enquiry by
                      phone, email or WhatsApp.
                    </FormLabel>
                    <p
                      id="consent-description"
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      {LEGAL.dataNotSold}{" "}
                      <Link
                        href="/privacy"
                        className="rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-brand"
                      >
                        Read our privacy policy
                      </Link>
                      .
                    </p>
                    <FormMessage />
                  </div>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="submit"
            size="lg"
            disabled={form.formState.isSubmitting}
            className="w-full sm:w-auto"
          >
            {form.formState.isSubmitting && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            Send enquiry
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {LEGAL.noGuarantee}
          </p>
        </div>
      </form>
    </Form>
  );
}
