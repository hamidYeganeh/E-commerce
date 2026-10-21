"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, useGSAP, ScrollTrigger };

// Read the same timing scale as the CSS interactions, in GSAP's seconds.
export function motionTiming(node: Element) {
  const style = getComputedStyle(node);
  const seconds = (name: string, fallback: number) => {
    const value = style.getPropertyValue(name).trim();
    const number = parseFloat(value);
    return Number.isFinite(number) ? number / (value.endsWith("ms") ? 1000 : 1) : fallback;
  };
  return {
    fast: seconds("--duration-fast", .25),
    reveal: seconds("--duration-very-slow", .5),
    stagger: seconds("--duration-stagger", .04),
  };
}

/** Image loads/ResizeObserver can arrive in bursts. Refresh only changed layout,
 * after it settles, and never reset scrubbed timelines in the middle of scrolling. */
export function refreshWhenReady(node: HTMLElement) {
  let active = true;
  let timer: ReturnType<typeof setTimeout>;
  let width = node.offsetWidth;
  let height = node.offsetHeight;
  let fontsReady = false;
  const flush = () => {
    if (!active) return;
    if (ScrollTrigger.isScrolling()) { timer = setTimeout(flush, 180); return; }
    const nextWidth = node.offsetWidth;
    const nextHeight = node.offsetHeight;
    if (nextWidth === width && nextHeight === height && !fontsReady) return;
    width = nextWidth;
    height = nextHeight;
    fontsReady = false;
    ScrollTrigger.refresh();
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 180); };
  void document.fonts.ready.then(() => { if (active) { fontsReady = true; schedule(); } });
  node.addEventListener("load", schedule, true);
  const resize = new ResizeObserver(schedule);
  resize.observe(node);
  return () => {
    active = false;
    clearTimeout(timer);
    resize.disconnect();
    node.removeEventListener("load", schedule, true);
  };
}
