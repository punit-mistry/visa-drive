"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  CornerDownLeft,
  HelpCircle,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuidedTour } from "@/components/shared/guided-tour";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  searchHelp,
  suggestedQuestions,
  type HelpMatch,
} from "@/lib/constants/help";
import { CUSTOMER_TOUR, STAFF_TOUR, tourKey, type Tour } from "@/lib/constants/tours";
import { cn } from "@/lib/utils";

/**
 * The help assistant, and the host for the guided tour.
 *
 * It is chat-shaped because that is what people reach for, but it is **not** a
 * language model: answers are matched against a fixed knowledge base plus the
 * live published FAQs an administrator wrote. That is deliberate. A generated
 * answer about a passport requirement that happens to be wrong costs someone a
 * trip, and this product's rule is that visa facts come only from the
 * catalogue (CLAUDE.md, "No invented facts").
 *
 * So the assistant's most important behaviour is the one it does when it does
 * *not* know: it says so, and offers to send the question to a real person —
 * which for a customer files a genuine enquiry in the CRM, with their details
 * already attached.
 */

type Turn =
  | { kind: "question"; id: string; text: string }
  | { kind: "answer"; id: string; matches: HelpMatch[]; query: string };

/** Same shape the server validates against, so the UI cannot promise a send it will refuse. */
function digitsOf(value: string): string {
  return value.replace(/D/g, "");
}

let turnSeq = 0;
const nextId = () => `turn-${(turnSeq += 1)}`;

export function HelpAssistant({ surface }: { surface: "customer" | "staff" }) {
  const { user, isLoading } = useCurrentUser();
  const markTourSeen = useMutation(api.users.markTourSeen);
  const resetTour = useMutation(api.users.resetTour);
  const submitEnquiry = useMutation(api.enquiries.submit);

  // Visa FAQs are the administrator's own words, and the only place this
  // assistant is allowed to get a visa fact from. Staff do not need them —
  // their questions are about operating the CRM.
  const faqs = useQuery(
    api.visaFAQs.listPublic,
    surface === "customer" ? { scope: "global" as const } : "skip",
  );

  const tour: Tour = surface === "customer" ? CUSTOMER_TOUR : STAFF_TOUR;
  const key = tourKey(tour);

  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phone, setPhone] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const autoStarted = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // React Compiler is enabled for this project, so these derivations and the
  // handlers below are memoized for us; hand-written useMemo/useCallback here
  // only fight it.
  const hasSeenTour = (user?.dismissedTours ?? []).includes(key);

  /* ------------------------------- the tour ------------------------------ */

  // First visit starts the tour by itself. The delay lets the shell finish
  // painting, because a spotlight measured against a half-mounted sidebar
  // lands in the wrong place.
  // Once per session, and never again — replaying the tour clears the stored
  // flag, and without this guard the pending timer would reopen the tour over
  // someone who had just closed it.
  useEffect(() => {
    if (isLoading || !user || hasSeenTour || autoStarted.current) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      setTourOpen(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [isLoading, user, hasSeenTour]);

  const finishTour = () => {
    setTourOpen(false);
    // Fire-and-forget: a failed preference write must never surface as an
    // error toast over someone who just finished reading a walkthrough.
    void markTourSeen({ tourId: key }).catch(() => undefined);
  };

  const replayTour = async () => {
    autoStarted.current = true;
    setOpen(false);
    try {
      await resetTour({ tourId: key });
    } catch {
      /* Replaying is still fine; it just will not re-arm for next time. */
    }
    setTourOpen(true);
  };

  /* ------------------------------ the answers ---------------------------- */

  const suggestions = suggestedQuestions(surface);

  /**
   * Start the conversation over.
   *
   * Everything here is local to the panel — nothing was persisted, so there is
   * nothing to undo on the server and no confirmation to ask for. The one
   * thing clearing does *not* undo is an enquiry already filed, so the toast
   * says so rather than letting the empty panel imply it was withdrawn.
   */
  const resetChat = () => {
    const hadEnquiry = escalated !== null;
    setTurns([]);
    setQuery("");
    setPhone("");
    setEscalated(null);
    toast.success(
      hadEnquiry
        ? "Chat cleared. Your question is still with the team."
        : "Chat cleared.",
    );
    inputRef.current?.focus();
  };

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const matches = searchHelp(trimmed, surface, faqs ?? []);
    setTurns((prior) => [
      ...prior,
      { kind: "question", id: nextId(), text: trimmed },
      { kind: "answer", id: nextId(), matches, query: trimmed },
    ]);
    setQuery("");
    setEscalated(null);
  };

  useEffect(() => {
    if (!open) return;
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* ---------------------------- the handover ----------------------------- */

  const lastQuestion = [...turns]
    .reverse()
    .find((turn): turn is Extract<Turn, { kind: "question" }> => turn.kind === "question");

  // An enquiry needs a reachable phone number — the office calls these back,
  // so the server insists on one. Most customers already have theirs on file;
  // the rest are asked for it here rather than being handed a failure after
  // they have clicked send.
  const storedPhone = user?.phone?.trim() ?? "";
  const needsPhone = digitsOf(storedPhone).length < 7;
  const phoneToSend = needsPhone ? phone : storedPhone;
  const phoneReady = (() => {
    const digits = digitsOf(phoneToSend).length;
    return digits >= 7 && digits <= 15;
  })();

  const escalate = async () => {
    if (!user || !lastQuestion || !phoneReady) return;
    setEscalating(true);
    try {
      const result = await submitEnquiry({
        fullName: user.fullName,
        email: user.email,
        phone: phoneToSend,
        subject: "Question from the help assistant",
        message: lastQuestion.text,
        source: "help_assistant",
      });
      setEscalated(result.referenceId);
      toast.success("Sent to the VisaDrive team.");
    } catch (error) {
      const message =
        error && typeof error === "object" && "data" in error
          ? ((error as { data?: { message?: string } }).data?.message ?? null)
          : null;
      toast.error(message ?? "Could not send your question. Please try again.");
    } finally {
      setEscalating(false);
    }
  };

  if (isLoading || !user) return null;

  return (
    <>
      <GuidedTour tour={tour} open={tourOpen} onFinish={finishTour} />

      {/* ------------------------------ launcher ----------------------------- */}
      <button
        type="button"
        data-tour="help-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full bg-brand-strong text-brand-foreground elev-lg transition-transform focus-brand hover:scale-105 active:scale-95 print:hidden",
          open && "scale-95",
        )}
      >
        {open ? (
          <X className="size-5" aria-hidden />
        ) : (
          <HelpCircle className="size-5" aria-hidden />
        )}
      </button>

      {/* ------------------------------- panel ------------------------------- */}
      {open && (
        <div
          role="dialog"
          aria-label="Help"
          className="animate-fade-up fixed inset-x-3 bottom-20 z-40 flex max-h-[min(34rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card elev-xl sm:inset-x-auto sm:right-5 sm:w-96 print:hidden"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="size-3.5 text-brand" aria-hidden />
                How can we help?
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {surface === "customer"
                  ? "Answers about your applications and this portal."
                  : "Answers about running the CRM."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Shown only once there is something to clear — an always-on
                  Reset with an empty transcript is a button that does nothing. */}
              {turns.length > 0 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={resetChat}
                  title="Clear this conversation"
                  aria-label="Clear this conversation"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={replayTour}
                title="Replay the guided tour"
              >
                <Compass className="size-3.5" aria-hidden />
                Tour
              </Button>
            </div>
          </header>

          <div ref={transcriptRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Ask a question in your own words, or start with one of these:
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => ask(question)}
                      className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-brand/40 hover:bg-brand-tint focus-brand"
                    >
                      <span className="min-w-0">{question}</span>
                      <ArrowRight
                        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) =>
              turn.kind === "question" ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-strong px-3.5 py-2 text-sm text-brand-foreground">
                    {turn.text}
                  </p>
                </div>
              ) : (
                <AnswerTurn
                  key={turn.id}
                  matches={turn.matches}
                  onFollowUp={ask}
                  onEscalate={escalate}
                  escalating={escalating}
                  escalated={escalated}
                  surface={surface}
                  needsPhone={needsPhone}
                  phone={phone}
                  onPhoneChange={setPhone}
                  canSend={phoneReady}
                />
              ),
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(query);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type your question…"
              aria-label="Your question"
              className="h-9"
            />
            <Button type="submit" size="sm" disabled={!query.trim()} aria-label="Ask">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function AnswerTurn({
  matches,
  onFollowUp,
  onEscalate,
  escalating,
  escalated,
  surface,
  needsPhone,
  phone,
  onPhoneChange,
  canSend,
}: {
  matches: HelpMatch[];
  onFollowUp: (question: string) => void;
  onEscalate: () => void;
  escalating: boolean;
  escalated: string | null;
  surface: "customer" | "staff";
  needsPhone: boolean;
  phone: string;
  onPhoneChange: (value: string) => void;
  canSend: boolean;
}) {
  const [best, ...related] = matches;

  if (!best) {
    return (
      <div className="space-y-3 rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-3">
        <p className="text-sm leading-relaxed">
          I do not have an answer for that one — I only answer from what our team has
          written down, and I would rather pass you to a person than guess.
        </p>
        {surface === "customer" ? (
          escalated ? (
            <p className="text-sm leading-relaxed text-success">
              Sent. Your reference is{" "}
              <span className="font-mono font-semibold">{escalated}</span> — we will
              reply by email and in your notifications.
            </p>
          ) : (
            <div className="space-y-2">
              {needsPhone && (
                <div className="space-y-1">
                  <label
                    htmlFor="help-phone"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    A number we can call you back on
                  </label>
                  <Input
                    id="help-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => onPhoneChange(event.target.value)}
                    placeholder="+91 98200 00000"
                    className="h-9"
                  />
                </div>
              )}
              <Button
                size="sm"
                onClick={onEscalate}
                disabled={escalating || !canSend}
              >
                {escalating ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <UserRound className="size-3.5" aria-hidden />
                )}
                Send this to the team
              </Button>
            </div>
          )
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ask an administrator — they can also grant permissions if that is what is
            blocking you.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-3">
        <p className="text-sm font-medium">{best.question}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {best.answer}
        </p>

        {best.source === "faq" && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/80">
            <BookOpen className="size-3" aria-hidden />
            From the VisaDrive visa FAQs
          </p>
        )}

        {best.action && (
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={best.action.href}>
              {best.action.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </div>

      {related.length > 0 && (
        <div className="space-y-1.5 pl-1">
          <p className="text-xs text-muted-foreground">Related</p>
          {related.map((match) => (
            <button
              key={match.question}
              type="button"
              onClick={() => onFollowUp(match.question)}
              className="flex w-full items-center gap-1.5 text-left text-xs text-brand underline-offset-2 transition-colors hover:underline focus-brand"
            >
              <CornerDownLeft className="size-3 shrink-0" aria-hidden />
              {match.question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
