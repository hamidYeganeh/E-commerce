import type { ReactNode } from "react";

// Streaming descendants hydrate independently. Keep global motion in CSS rather
// than changing their attributes from a parent effect before they hydrate.
// Reveal and ScrollScene own GSAP only inside their own client lifecycles.
export function PageMotion({ children }: { children: ReactNode }) {
  return <div className="page-motion-root">{children}</div>;
}
