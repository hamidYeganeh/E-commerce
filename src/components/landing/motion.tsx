"use client";

import { Children, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, motionTiming } from "@/components/motion/gsap";

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const node = ref.current;
    if (!node) return;
    const media = gsap.matchMedia();
    media.add("screen and (prefers-reduced-motion: no-preference)", () => {
      // Back navigation and anchor links must never hide content above the viewport.
      if (node.getBoundingClientRect().bottom <= 0) return;
      const lines = Array.from(node.children);
      const timing = motionTiming(node);
      const entrance = gsap.from(lines, {
        opacity: 0, y: 12, duration: timing.reveal, ease: "power3.out",
        stagger: Math.min(timing.stagger, .24 / Math.max(1, lines.length - 1)),
        clearProps: "opacity,transform",
        scrollTrigger: { trigger: node, start: "top 94%", once: true },
      });
      const showFocusedContent = () => entrance.progress(1);
      node.addEventListener("focusin", showFocusedContent);
      return () => node.removeEventListener("focusin", showFocusedContent);
    }, ref);
    return () => media.revert();
  }, { scope: ref });
  return (
    <div ref={ref} className={cn("motion-reveal", className)}>
      {Children.map(children, child => child && (
        <div className="motion-reveal-line">{child}</div>
      ))}
    </div>
  );
}

export function ScrollScene({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const node = ref.current;
    if (!node) return;
    const media = gsap.matchMedia();
    media.add({ desktop: "(min-width: 851px)", mobile: "(max-width: 850px)", reduce: "(prefers-reduced-motion: reduce)", print: "print" }, context => {
      if (context.conditions?.reduce || context.conditions?.print) return;
      const distance = context.conditions?.desktop ? 1 : .45;
      const timeline = gsap.timeline({
        defaults: { duration: 1, ease: "none" },
        scrollTrigger: { trigger: node, start: "clamp(top bottom)", end: "clamp(bottom top)", scrub: .35 },
      });
      // Direct transforms avoid recalculating an inherited custom property on
      // the entire scene subtree on every frame.
      const layers = [
        { selector: ".vb-ingredient-jar", travel: -36, rotation: -4, turn: 3, centered: true },
        { selector: ".vb-comb-one", travel: -48, rotation: -12, turn: -5 },
        { selector: ".vb-comb-two", travel: 44, rotation: 18, turn: 7 },
        { selector: ".vb-comb-three", travel: -30, rotation: -12, turn: 9 },
        { selector: ".vb-scenic-visual > img", travel: -45, rotation: -12, turn: 3 },
      ];
      for (const layer of layers) {
        const image = node.matches(".vb-scenic-visual") && layer.selector === ".vb-scenic-visual > img" ? node.querySelector("img") : node.querySelector(layer.selector);
        if (!image) continue;
        const center = layer.centered ? { xPercent: -50, x: 0 } : {};
        timeline.fromTo(image, { ...center, y: -layer.travel * distance, rotation: layer.rotation - layer.turn * distance },
          { ...center, y: layer.travel * distance, rotation: layer.rotation + layer.turn * distance }, 0);
      }
    }, ref);
    return () => media.revert();
  }, { scope: ref });
  return <div ref={ref} className={cn("vb-scroll-scene", className)}>{children}</div>;
}
