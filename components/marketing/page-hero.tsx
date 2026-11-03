import Image from "next/image";
import type { ReactNode } from "react";

import { FadeIn } from "@/components/marketing/reveal";

/**
 * Masthead for the secondary marketing pages.
 *
 * The homepage owns the full cinematic hero; every other route gets this
 * shorter sibling of it — ink ground, one held-back photograph, a serif
 * headline set low in the frame. The photograph is atmosphere only, so it
 * carries no alt text.
 *
 * The image layer deliberately has no negative z-index: inside an `isolate`
 * parent a `-z-10` child paints behind the parent's own background colour and
 * vanishes. The type sits in a `relative z-10` sibling instead.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  marks,
  image,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small factual marks along the foot of the frame. */
  marks?: string[];
  image?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-ink-black">
      {image && (
        <>
          <Image
            src={image}
            alt=""
            aria-hidden
            fill
            priority
            sizes="100vw"
            quality={70}
            className="object-cover object-center opacity-35"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink-black via-ink-black/65 to-ink-black/35"
          />
        </>
      )}

      <div className="container-wide relative z-10 flex min-h-[26rem] flex-col justify-end pb-12 pt-20 sm:min-h-[32rem] lg:min-h-[36rem] lg:pb-16">
        <FadeIn>
          <p className="text-eyebrow-dark">{eyebrow}</p>
          <h1 className="display-xl mt-5 max-w-4xl text-paper">{title}</h1>

          {description && (
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
              {description}
            </p>
          )}

          {actions && (
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              {actions}
            </div>
          )}
        </FadeIn>

        {marks && marks.length > 0 && (
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/12 pt-5">
            {marks.map((mark) => (
              <li
                key={mark}
                className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55"
              >
                {mark}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Outline button styling for use on an ink ground. */
export const ON_DARK_OUTLINE =
  "h-12 border-white/30 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-white/5";
