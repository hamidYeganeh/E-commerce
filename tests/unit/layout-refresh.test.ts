import test from "node:test";
import assert from "node:assert/strict";
import { refreshWhenReady, ScrollTrigger } from "../../src/components/motion/gsap";

test("layout refresh ignores unchanged image loads, coalesces geometry changes, and waits for scrolling", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  let notifyResize = () => {};
  let disconnected = false;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { fonts: { ready: new Promise<void>(() => {}) } } });
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
    constructor(callback: () => void) { notifyResize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
    if (previousObserver) Object.defineProperty(globalThis, "ResizeObserver", previousObserver); else Reflect.deleteProperty(globalThis, "ResizeObserver");
  });
  let scrolling = false;
  const refresh = t.mock.method(ScrollTrigger, "refresh", () => {});
  t.mock.method(ScrollTrigger, "isScrolling", () => scrolling);
  const element = Object.assign(new EventTarget(), { offsetWidth: 1200, offsetHeight: 8000 });
  const dispose = refreshWhenReady(element as unknown as HTMLElement);
  for (let i = 0; i < 30; i++) { element.dispatchEvent(new Event("load")); notifyResize(); }
  t.mock.timers.tick(180);
  assert.equal(refresh.mock.callCount(), 0, "fixed-size image loads must not reset scroll animations");

  element.offsetHeight += 200;
  for (let i = 0; i < 30; i++) notifyResize();
  scrolling = true;
  t.mock.timers.tick(540);
  assert.equal(refresh.mock.callCount(), 0, "do not reset scrub progress while scrolling");
  scrolling = false;
  t.mock.timers.tick(180);
  assert.equal(refresh.mock.callCount(), 1, "a burst of real layout changes needs one refresh");
  notifyResize();
  t.mock.timers.tick(180);
  assert.equal(refresh.mock.callCount(), 1, "refresh must not feed back into ResizeObserver");

  element.offsetHeight += 100;
  notifyResize();
  dispose();
  t.mock.timers.tick(1000);
  assert.equal(refresh.mock.callCount(), 1, "unmounted pages must not refresh later");
  assert.equal(disconnected, true);
});
