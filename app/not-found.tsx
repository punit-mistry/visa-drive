import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo size="lg" />

      <p className="mt-10 text-eyebrow">Error 404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        We could not find that page
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The link may be out of date, or the page may have moved.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/destinations">Browse destinations</Link>
        </Button>
      </div>
    </div>
  );
}
