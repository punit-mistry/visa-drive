"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Sign the visitor out of Clerk, then send them to the home page.
 *
 * Lives under the auth layout because that is the only place with a
 * ClerkProvider — the public header deliberately does not load Clerk, so it
 * links here instead of calling `signOut` itself.
 */
export default function SignOutPage() {
  const { signOut, loaded } = useClerk();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    signOut({ redirectUrl: "/" }).catch(() => setFailed(true));
  }, [loaded, signOut]);

  return (
    <div className="flex flex-col items-start gap-4 py-16">
      {failed ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">We could not sign you out</h1>
          <p className="text-sm text-muted-foreground">Try again, or go back to the site.</p>
          <div className="flex gap-2">
            <Button onClick={() => signOut({ redirectUrl: "/" })}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/">Back to site</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Signing you out…</p>
        </>
      )}
    </div>
  );
}
