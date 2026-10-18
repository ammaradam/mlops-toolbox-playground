import { useEffect, useState } from 'react';

export const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, reduced() ? 0 : ms));

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'idle'; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
