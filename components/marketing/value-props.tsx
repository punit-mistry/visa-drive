import { RevealItem } from "@/components/marketing/reveal";
import { Section, SectionIntro } from "@/components/marketing/section";
import type { SectionTone } from "@/components/marketing/section";
import { IconTile } from "@/components/marketing/icon";
import { VALUE_PROPS } from "@/lib/constants/site";

/**
 * Why VisaDrive — the client's own value propositions, reproduced from
 * `VALUE_PROPS`. No approval rates, no headline statistics, no timelines.
 */
export function ValueProps({
  tone = "default",
}: {
  tone?: SectionTone;
}) {
  return (
    <Section tone={tone}>
      <SectionIntro
        eyebrow="Why VisaDrive"
        title="Straight answers, careful work"
        description="A private consultancy, not a form filler. What you get is a team that reads your case, tells you what is realistic and handles the paperwork properly."
      />

      <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 lg:mt-12">
        {VALUE_PROPS.map((prop, index) => {
          return (
            <RevealItem as="li" key={prop.title} index={index} className="bg-card">
              <div className="flex h-full flex-col p-6 lg:p-8">
                <IconTile name={prop.icon} />
                <h3 className="mt-5 text-base font-semibold">{prop.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {prop.body}
                </p>
              </div>
            </RevealItem>
          );
        })}
      </ul>
    </Section>
  );
}
