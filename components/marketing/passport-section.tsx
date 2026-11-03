"use client";

import { Reveal } from "@/components/marketing/reveal";
import { PassportCanvas } from "@/components/marketing/passport-canvas";
import { LEGAL, SITE } from "@/lib/constants/site";

/**
 * The passport plate.
 *
 * This interaction used to sit in the hero. The cinematic hero needs one
 * subject, not two, so the passport moved here — where it does more work
 * anyway: by this point the visitor has read what we promise and how the
 * process runs, and pressing a stamp for their own destination is the moment
 * that turns reading into intent.
 *
 * The caption stays attached to it. A stamp records an appointment, which is
 * what VisaDrive delivers; it is not an approval, which is the consulate's
 * decision alone.
 */
export function PassportSection() {
  return (
    <section className="bg-charcoal py-16 text-paper sm:py-20 lg:py-24">
      <div className="container-wide grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <Reveal>
          <p className="text-eyebrow-dark">Your passport</p>
          <h2 className="display-xl mt-4 text-paper">
            One page.
            <br />
            Six ways out.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
            Pick a destination and watch it land. {SITE.name} handles the
            appointment, the paperwork and the follow-up for every country on
            this page.
          </p>
          <p className="mt-7 max-w-md border-t border-white/12 pt-4 text-xs leading-relaxed text-white/40">
            A stamp here means an appointment booked — not a visa granted.{" "}
            {LEGAL.noGuarantee}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <PassportCanvas />
        </Reveal>
      </div>
    </section>
  );
}
