"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, RefreshCw, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What a route segment shows when a Convex query refused it.
 *
 * `useQuery` has no error channel — a refusal throws during render and the
 * nearest boundary catches it. Without this, a staff member opening an
 * application they are not allowed to see got the global "Something went
 * wrong" page, which reads as a broken product rather than as a closed door.
 *
 * The `code` on a `ConvexError` is exactly what tells those two apart, which
 * is why every backend throw in this project carries one.
 */

type ErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "NO_PROFILE"
  | "SUSPENDED";

function codeOf(error: unknown): ErrorCode | null {
  const data = (error as { data?: unknown })?.data;
  if (data && typeof data === "object" && "code" in data) {
    const code = String((data as { code: unknown }).code);
    if (
      code === "FORBIDDEN" ||
      code === "NOT_FOUND" ||
      code === "UNAUTHENTICATED" ||
      code === "NO_PROFILE" ||
      code === "SUSPENDED"
    ) {
      return code;
    }
  }
  return null;
}

function messageOf(error: unknown): string | null {
  const data = (error as { data?: unknown })?.data;
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return null;
}

const COPY: Record<
  ErrorCode,
  { icon: typeof Lock; title: string; fallback: string }
> = {
  FORBIDDEN: {
    icon: Lock,
    title: "You do not have access to this",
    fallback:
      "Your role does not cover this page. Ask an administrator if you think it should.",
  },
  NOT_FOUND: {
    icon: SearchX,
    title: "Not found",
    fallback: "This record does not exist, or it has been removed.",
  },
  UNAUTHENTICATED: {
    icon: Lock,
    title: "Please sign in again",
    fallback: "Your session has expired.",
  },
  NO_PROFILE: {
    icon: RefreshCw,
    title: "Your account is still being set up",
    fallback: "Give it a moment and refresh.",
  },
  SUSPENDED: {
    icon: Lock,
    title: "This account is suspended",
    fallback: "Contact VisaDrive support to restore access.",
  },
};

export function RouteError({
  error,
  reset,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  backHref: string;
  backLabel: string;
}) {
  useEffect(() => {
    console.error("[visadrive] route error", error);
  }, [error]);

  const code = codeOf(error);
  const copy = code ? COPY[code] : null;
  const Icon = copy?.icon ?? RefreshCw;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>

      <h1 className="text-xl font-semibold tracking-tight">
        {copy?.title ?? "Something went wrong"}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {messageOf(error) ??
          copy?.fallback ??
          "This page could not be loaded. Nothing has been lost — try again."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {/* A refusal does not become an allow on retry, so "try again" is only
            offered when the cause might actually be transient. */}
        {code !== "FORBIDDEN" && code !== "NOT_FOUND" && (
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
        )}
        <Button variant={code === "FORBIDDEN" ? "default" : "outline"} asChild>
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-8 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
