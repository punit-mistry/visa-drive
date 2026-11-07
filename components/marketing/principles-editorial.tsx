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
    <section className="bg-surface py-20 text-foreground sm:py-24 lg:py-32">
      <div className="container-wide">
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-eyebrow">Why VisaDrive</p>
            <h2 className="display-xl mt-4 text-foreground">
              Straight answers,
              <br />
              careful work.
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground lg:col-span-5">
            A private consultancy, not a form filler. What you get is a team that
            reads your case, tells you what is realistic and handles the
            paperwork properly.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-x-16 lg:mt-20 lg:grid-cols-2">
          {VALUE_PROPS.map((prop, index) => (
            <RevealItem as="li" key={prop.title} index={index % 2}>
              <div className="group h-full border-t border-border py-8 lg:py-10">
                <span className="numeral text-2xl leading-none text-muted-foreground transition-colors duration-500 group-hover:text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="display-md mt-5 text-foreground">{prop.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
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
