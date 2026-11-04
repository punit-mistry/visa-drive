"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * A one-shot celebration burst for the few moments that deserve one —
 * submitting an application, and nothing else.
 *
 * Canvas rather than a few hundred DOM nodes, and no new dependency: the
 * whole thing is ~60 lines of particle integration. It paints on a fixed,
 * pointer-transparent layer, runs for a little under three seconds, then
 * releases the frame loop — a page that keeps animating forever behind a
 * success message is a battery leak, not a flourish.
 *
 * Colours are read from the live design tokens, so the palette (and dark
 * mode) stays the single source of truth. `prefers-reduced-motion` turns the
 * whole thing off; the success screen reads perfectly well without it.
 */

const DURATION_MS = 2800;
const PARTICLE_COUNT = 110;
const GRAVITY = 0.00042; // px per ms²
const DRAG = 0.9985;

/** Fallbacks for a token that resolves to something canvas will not accept. */
const FALLBACK_COLOURS = ["#d82828", "#0e9f6e", "#2b4a9b", "#f2b705", "#17141a"];
const TOKENS = ["--brand", "--success", "--navy", "--brand-strong", "--foreground"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  tilt: number;
  spin: number;
  colour: string;
  shape: "rect" | "circle";
}

/** A token is only usable if the 2D context actually accepts it. */
function resolveColours(): string[] {
  if (typeof document === "undefined") return FALLBACK_COLOURS;
  const probe = document.createElement("canvas").getContext("2d");
  const styles = getComputedStyle(document.documentElement);

  return TOKENS.map((token, index) => {
    const fallback = FALLBACK_COLOURS[index]!;
    const value = styles.getPropertyValue(token).trim();
    if (!value || !probe) return fallback;
    probe.fillStyle = "#000000";
    probe.fillStyle = value;
    return probe.fillStyle === "#000000" && value !== "#000000" ? fallback : value;
  });
}

function makeParticles(width: number, height: number, colours: string[]): Particle[] {
  // Two launch points, angled inward, so the burst frames the content in the
  // middle of the page instead of covering it.
  const origins = [
    { x: width * 0.2, y: height * 0.62, spread: -0.35 },
    { x: width * 0.8, y: height * 0.62, spread: 0.35 },
  ];

  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const origin = origins[i % origins.length]!;
    const angle = -Math.PI / 2 + origin.spread + (Math.random() - 0.5) * 1.1;
    const speed = 0.45 + Math.random() * 0.55;

    return {
      x: origin.x + (Math.random() - 0.5) * 40,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      tilt: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.012,
      colour: colours[i % colours.length]!,
      shape: Math.random() > 0.35 ? "rect" : "circle",
    };
  });
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function Confetti({ run = true }: { run?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The server cannot know the preference, so it assumes "reduce" and renders
  // nothing; the real answer arrives on hydration, a frame before the canvas
  // would have been visible anyway.
  const reduced = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const allowed = !reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!run || !allowed || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);

    const particles = makeParticles(width, height, resolveColours());
    let frame = 0;
    let start: number | null = null;
    let previous: number | null = null;

    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      const delta = Math.min(now - (previous ?? now), 48);
      previous = now;

      if (elapsed >= DURATION_MS) {
        context.clearRect(0, 0, width, height);
        return;
      }

      context.clearRect(0, 0, width, height);
      // Hold full opacity, then fade the last third so nothing pops out.
      context.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / (DURATION_MS * 0.38));

      for (const p of particles) {
        p.vy += GRAVITY * delta;
        p.vx *= DRAG;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.tilt += p.spin * delta;

        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.tilt);
        context.fillStyle = p.colour;
        if (p.shape === "circle") {
          context.beginPath();
          context.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          context.fill();
        } else {
          // Squashed by the tilt, which is what sells it as a paper flake.
          context.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.6);
        }
        context.restore();
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, allowed]);

  if (!run || !allowed) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 size-full print:hidden"
    />
  );
}
