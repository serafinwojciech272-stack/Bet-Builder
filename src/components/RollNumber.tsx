import type { CSSProperties } from 'react';

/**
 * Odometer-style number: each digit rolls once through 0–9 into place on mount.
 * Re-key the component to replay. Non-digits (".", ",") stay static.
 * Screen readers get the plain value.
 */
export function RollNumber({ value, className }: { value: string; className?: string }) {
  let d = 0;
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span className="ar-roll" aria-hidden="true">
        {value.split('').map((ch, i) => {
          if (!/\d/.test(ch)) return <span key={i} className="ar-roll__static">{ch}</span>;
          const n = 10 + Number(ch);
          const style = { '--n': n, '--d': d++ } as CSSProperties;
          return (
            <span key={i} className="ar-roll__d">
              <span className="ar-roll__col" style={style}>
                {Array.from({ length: 20 }, (_, k) => <span key={k}>{k % 10}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
