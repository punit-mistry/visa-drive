import { Reveal, RevealItem } from "@/components/marketing/reveal";
import { VALUE_PROPS } from "@/lib/constants/site";

/**
 * Why VisaDrive, as a dark editorial section.
 *
 * Reads the client's own value propositions from `VALUE_PROPS` and prints
 * them as written — no approval rates, no headline statistics, no timelines.
 */
export function PrinciplesEditorial() {
  return (
    <section className="bg-ink-black py-20 text-paper sm:py-24 lg:py-32">
      <div className="container-wide">
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-eyebrow-dark">Why VisaDrive</p>
            <h2 className="display-xl mt-4 text-paper">
              Straight answers,
              <br />
              careful work.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-white/55 lg:col-span-5">
            A private consultancy, not a form filler. What you get is a team that
            reads your case, tells you what is realistic and handles the
            paperwork properly.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-x-16 lg:mt-20 lg:grid-cols-2">
          {VALUE_PROPS.map((prop, index) => (
            <RevealItem as="li" key={prop.title} index={index % 2}>
              <div className="group h-full border-t border-white/12 py-8 lg:py-10">
                <span className="numeral text-2xl leading-none text-white/25 transition-colors duration-500 group-hover:text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="display-md mt-5 text-paper">{prop.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/55">
                  {prop.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </ul>
      </div>
    </section>
  );
}
