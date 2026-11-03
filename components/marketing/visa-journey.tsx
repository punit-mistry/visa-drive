"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { LEGAL } from "@/lib/constants/site";

/**
 * The visa journey, as an editorial sequence.
 *
 * These five steps are the application the product actually runs — the four
 * wizard steps at `/apply/[id]` plus the checkout that follows — rather than
 * a generic marketing funnel. If the wizard gains a step, this has to gain
 * one too, which is why each entry names the surface it describes.
 *
 * The rule beside each step draws itself in as the step scrolls into view:
 * one piece of motion, carrying the idea of progress, and nothing else.
 */

const STEPS = [
  {
    number: "01",
    title: "Choose your destination",
    body: "Pick the country and the visa type that matches your trip. Fees and processing windows are shown before you commit to anything.",
  },
  {
    number: "02",
    title: "Share your details",
    body: "Traveller details, passport information and your travel dates. Your progress saves as you type, so you can stop and come back.",
  },
  {
    number: "03",
    title: "Prepare your documents",
    body: "Upload against a checklist built for your specific visa. We review every file before anything is submitted.",
  },
  {
    number: "04",
    title: "Submit and pay securely",
    body: "Your total is recomputed on our server, then handled by Razorpay. We never see your card details.",
  },
  {
    number: "05",
    title: "Track every update",
    body: "Follow each status change from your dashboard, with notifications when we need something from you.",
  },
];

export function VisaJourney() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-ink-black py-20 text-paper sm:py-24 lg:py-32">
      <div className="container-wide">
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-eyebrow-dark">The journey</p>
            <h2 className="display-xl mt-4 text-paper">
              Five steps,
              <br />
              start to finish.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-white/55 lg:col-span-5">
            A visa application is mostly paperwork and timing. We take both off
            your desk and keep you told at every stage.
          </p>
        </Reveal>

        <ol className="mt-14 lg:mt-20">
          {STEPS.map((step, index) => (
            <li key={step.number}>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{
                  duration: 0.6,
                  delay: Math.min(index, 4) * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group relative grid gap-x-8 gap-y-3 border-t border-white/12 py-8 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,22rem)_minmax(0,1fr)] lg:py-11"
              >
                {/* The row underlines itself on hover: a red rule drawn
                    left to right over the hairline below it. Sitting on the
                    bottom edge means it lands on the next row's top border —
                    and on the closing rule for the last step — so every step
                    underlines against an existing line rather than floating.
                    The global reduced-motion rule flattens the transition. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-brand transition-transform duration-500 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
                />

                <span className="numeral text-5xl leading-none text-white/25 transition-colors duration-500 group-hover:text-brand lg:text-7xl">
                  {step.number}
                </span>

                <h3 className="display-md text-paper transition-transform duration-500 ease-out group-hover:translate-x-1">
                  {step.title}
                </h3>

                <p className="max-w-md text-[15px] leading-relaxed text-white/55 sm:col-start-2 lg:col-start-3">
                  {step.body}
                </p>
              </motion.div>
            </li>
          ))}
        </ol>

        <Reveal className="flex flex-col gap-6 border-t border-white/12 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-white/40">
            {LEGAL.noGuarantee} Our job is to make sure nothing in your
            application is the reason for a delay.
          </p>
          <Button asChild size="lg" className="shrink-0 font-semibold">
            <Link href="/how-it-works">
              See it in detail
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
