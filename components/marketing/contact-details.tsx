"use client";

import { Mail, MapPin, Phone } from "lucide-react";

import { WhatsAppButton } from "@/components/shared/whatsapp-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { phoneDigits } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

/**
 * Contact details, read through `useSiteSettings` so staff can change the
 * phone number or address from Admin → Settings without a deploy. The
 * constants in `lib/constants/site.ts` are the fallback, which is why this
 * renders correctly against an empty database.
 */
export function ContactDetails({
  className,
  layout = "stack",
  withWhatsApp = true,
}: {
  className?: string;
  layout?: "stack" | "grid" | "rows";
  withWhatsApp?: boolean;
}) {
  const settings = useSiteSettings();

  const items = [
    {
      icon: Phone,
      label: "Phone",
      value: settings.phoneDisplay,
      href: `tel:+${phoneDigits(settings.phone)}`,
      secondary: settings.phoneSecondaryDisplay,
      secondaryHref: `tel:+${phoneDigits(settings.phoneSecondary)}`,
    },
    {
      icon: Mail,
      label: "Email",
      value: settings.email,
      href: `mailto:${settings.email}`,
    },
    {
      icon: MapPin,
      label: "Office",
      value: settings.address,
    },
  ];

  return (
    <div className={className}>
      <ul
        className={cn(
          layout === "grid" &&
            "grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3",
          layout === "stack" && "space-y-5",
          layout === "rows" && "border-t border-ink-black/12",
        )}
      >
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              layout === "grid" && "bg-card p-5",
              layout === "stack" && "flex items-start gap-3.5",
              layout === "rows" &&
                "grid items-baseline gap-1 border-b border-ink-black/12 py-5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-6",
            )}
          >
            {layout === "rows" ? (
              <>
                <p className="text-eyebrow">{item.label}</p>
                <ContactValue item={item} large />
              </>
            ) : layout === "grid" ? (
              <>
                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-brand">
                  <item.icon className="size-4" aria-hidden />
                </span>
                <p className="mt-4 text-eyebrow">{item.label}</p>
                <ContactValue item={item} className="mt-1.5" />
              </>
            ) : (
              <>
                <item.icon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0">
                  <p className="text-eyebrow">{item.label}</p>
                  <ContactValue item={item} className="mt-1" />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {settings.businessHours && (
        <p className="mt-5 text-sm text-muted-foreground">
          {settings.businessHours}
        </p>
      )}

      {withWhatsApp && (
        <div className="mt-6">
          <WhatsAppButton variant="inline" />
        </div>
      )}
    </div>
  );
}

function ContactValue({
  item,
  className,
  large = false,
}: {
  item: {
    value: string;
    href?: string;
    secondary?: string;
    secondaryHref?: string;
  };
  className?: string;
  large?: boolean;
}) {
  return (
    <div className={cn(large ? "text-base sm:text-lg" : "text-sm", className)}>
      {item.href ? (
        <a
          href={item.href}
          className="rounded-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-brand hover:underline focus-brand"
        >
          {item.value}
        </a>
      ) : (
        <span className={large ? "text-foreground" : "text-muted-foreground"}>
          {item.value}
        </span>
      )}

      {item.secondary && item.secondaryHref && (
        <>
          <span aria-hidden className="mx-2 text-muted-foreground/50">
            ·
          </span>
          <a
            href={item.secondaryHref}
            className="rounded-sm text-muted-foreground underline-offset-4 transition-colors hover:text-brand hover:underline focus-brand"
          >
            {item.secondary}
          </a>
        </>
      )}
    </div>
  );
}

/** Thin skeleton used while a page waits on the settings query. */
export function ContactDetailsSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3.5">
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}
