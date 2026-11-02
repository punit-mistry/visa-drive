import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a VisaDrive account to apply for visas, upload documents securely and track your application.",
};

export const instant = false;

export default function SignUpPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          It takes a minute. You can start an application straight away.
        </p>
      </div>

      <SignUp
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
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        By continuing you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
