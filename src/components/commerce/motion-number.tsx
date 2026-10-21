export function MotionNumber({ value }: { value: string }) {
  return <span className="commerce-motion-number"><span className="sr-only">{value}</span><span key={value} className="t-digit-group is-animating" aria-hidden="true" dir="ltr">{Array.from(value).map((char, index, chars) => <span key={index} className="t-digit" data-stagger={chars.length > 1 && index === chars.length - 1 ? "1" : undefined}>{char}</span>)}</span></span>;
}
export function SuccessCheck() {
  return <span className="t-success-check" data-state="in" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg></span>;
}
