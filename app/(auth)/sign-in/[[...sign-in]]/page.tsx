import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track your visa applications with VisaDrive.",
};

export const instant = false;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The middleware parks the intended destination here — often
  // /apply?product=<id>, which starts that application on arrival. Carry it
  // over to sign-up too, so someone without an account does not lose their
  // place by taking the only other door on this page.
  const { redirect_url: redirectUrl } = await searchParams;
  const signUpHref =
    typeof redirectUrl === "string" && redirectUrl.startsWith("/")
      ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
      : "/sign-up";

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to track your applications and talk to your visa team.
        </p>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full shadow-none",
            card: "w-full border-0 shadow-none p-0 bg-transparent",
            header: "hidden",
            footer: "hidden",
          },
        }}
      />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to VisaDrive?{" "}
        <Link
          href={signUpHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
