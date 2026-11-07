"use client";

import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants/site";
import { phoneDigits } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "vd.whatsapp.dismissed";
const DISMISS_EVENT = "vd:whatsapp-dismissed";

function subscribeDismissed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

function getDismissedSnapshot(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const getServerDismissedSnapshot = () => false;

/**
 * Click-to-chat support button.
 *
 * WhatsApp is how a lot of VisaDrive's customers already talk to them, so this
 * is a first-class entry point rather than a footer link. It opens a pre-filled
 * wa.me thread — no WhatsApp API credentials are needed for this direction;
 * those are only required for *outbound* notifications.
 */
export function WhatsAppButton({
  message = "Hi VisaDrive, I would like help with a visa application.",
  className,
  variant = "floating",
  label = "Chat on WhatsApp",
  number,
}: {
  message?: string;
  className?: string;
  variant?: "floating" | "inline" | "icon";
  label?: string;
  number?: string;
}) {
  const target =
    number ??
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ??
    phoneDigits(SITE.contact.whatsapp);

  const href = `https://wa.me/${phoneDigits(target)}?text=${encodeURIComponent(message)}`;

  if (variant === "inline") {
    return (
      <Button asChild variant="outline" className={className}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          <WhatsAppGlyph className="size-4" />
          {label}
        </a>
      </Button>
    );
  }

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-brand",
          className,
        )}
      >
        <WhatsAppGlyph className="size-4" />
      </a>
    );
  }

  return <FloatingWhatsApp href={href} label={label} className={className} />;
}

function FloatingWhatsApp({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const dismissed = useSyncExternalStore(subscribeDismissed, getDismissedSnapshot, getServerDismissedSnapshot);

  // Hold it back until the visitor has engaged a little — a chat bubble that
  // appears instantly on a cold page reads as an ad.
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
      window.dispatchEvent(new Event(DISMISS_EVENT));
    } catch {
      /* non-fatal */
    }
  }

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-40 flex items-center gap-2 transition-all duration-300 print:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        className,
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide the WhatsApp button"
        className="flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground elev-sm transition-colors hover:text-foreground focus-brand"
      >
        <X className="size-3.5" aria-hidden />
      </button>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // Ink on the brand green, not white: white on #25D366 is 1.98:1 and
        // fails WCAG AA outright, while the same green under near-black type
        // reads at 10.6:1 and keeps the colour everyone recognises.
        className="flex items-center gap-2.5 rounded-full bg-[#25D366] py-3 pl-3.5 pr-5 font-medium text-ink-black elev-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2"
      >
        <WhatsAppGlyph className="size-5" />
        <span className="text-sm">{label}</span>
      </a>
    </div>
  );
}

/** WhatsApp's mark — lucide has no brand icons, so this is inlined. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.8 11.8 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413" />
    </svg>
  );
}

export { WhatsAppGlyph };
