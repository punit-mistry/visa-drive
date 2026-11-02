"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll reveal.
 *
 * One small fade + lift, once, on entry. `useReducedMotion` is checked in JS
 * as well as the CSS rule in globals.css, because a Motion animation runs off
 * the main thread and would otherwise ignore the media query entirely.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
  y = 14,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article" | "header";
  y?: number;
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}

/** Children revealed in sequence. `index` drives the stagger. */
export function RevealItem({
  children,
  index = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  return (
    <Reveal as={as} className={className} delay={Math.min(index, 6) * 0.06}>
      {children}
    </Reveal>
  );
}

/** A plain fade for above-the-fold content, which has nothing to scroll into. */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
