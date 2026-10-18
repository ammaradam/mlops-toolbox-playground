import { useEffect, useRef, useState } from 'react';
import { drift, type DriftColumn, type DriftKnobs, type DriftResult } from '../api';
import { Compare } from '../Compare';
import { Chip, pct, useDebounced } from '../ui';

const BASE: DriftKnobs = { income_shift: 0, loan_scale: 1, student_share: 0.08, poor_share: 0.15 };
const SCENES: { label: string; hint: string; knobs: DriftKnobs }[] = [
  { label: 'Same as training', hint: 'no change', knobs: BASE },
  { label: 'Recession', hint: 'incomes −30%, poor credit up', knobs: { ...BASE, income_shift: -0.3, poor_share: 0.4, loan_scale: 1.4 } },
  { label: 'Student campaign', hint: '40% students', knobs: { ...BASE, student_share: 0.4 } },
  { label: 'Bigger loans', hint: 'loan sizes ×1.6', knobs: { ...BASE, loan_scale: 1.6 } },
];
const SLIDERS: { key: keyof DriftKnobs; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: 'income_shift', label: 'Income', min: -0.5, max: 0.5, step: 0.05, show: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },
  { key: 'loan_scale', label: 'Loan size', min: 0.6, max: 1.8, step: 0.1, show: v => `×${v.toFixed(1)}` },
  { key: 'student_share', label: 'Students', min: 0, max: 0.6, step: 0.02, show: pct },
  { key: 'poor_share', label: 'Poor credit', min: 0, max: 0.6, step: 0.02, show: pct },
];

function Spark({ col }: { col: DriftColumn }) {
  const peak = Math.max(...col.ref, ...col.cur, 0.01);
  return (
    <span className="spark" role="img" aria-label={`${col.name}: baseline versus now`}>
      {col.labels.map((l, i) => (
        <span key={l} className="sp" title={`${l}: baseline ${pct(col.ref[i])}, now ${pct(col.cur[i])}`}>
          <i className="ref" style={{ height: `${(col.ref[i] / peak) * 100}%` }} />
          <i className={`cur ${col.drift ? 'hot' : ''}`} style={{ height: `${(col.cur[i] / peak) * 100}%` }} />
        </span>
      ))}
    </span>
  );
}

export function WatchStep() {
  const [knobs, setKnobs] = useState(BASE);
  const [scene, setScene] = useState(0);
  const [result, setResult] = useState<DriftResult | null>(null);
  const settled = useDebounced(knobs, 160);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    drift(settled).then(r => { if (mine === seq.current) setResult(r); }).catch(() => undefined);
  }, [settled]);

  const rows = result ? [...result.columns, { ...result.prediction, name: 'answers' }] : [];
  const hot = rows.filter(r => r.drift).length;
  const down = result ? result.prediction.approval_cur < result.prediction.approval_ref - 0.03 : false;
  return (
    <div className="stack">
      <div className="presets" role="group" aria-label="Pick a situation">
        {SCENES.map((s, i) => <button key={s.label} type="button" className={`preset ${scene === i ? 'on' : ''}`} onClick={() => { setScene(i); setKnobs(s.knobs); }}><strong>{s.label}</strong><span>{s.hint}</span></button>)}
      </div>
      <Compare
        without={result && (
          <>
            <p className="row"><Chip tone={down ? 'warn' : 'idle'}>no alert</Chip></p>
            <p className={down ? 'warnline' : 'muted'}>Approvals went {pct(result.prediction.approval_ref)} → <strong>{pct(result.prediction.approval_cur)}</strong>.{down ? ' Nobody is told. You hear about it from customers.' : ' Nothing to see.'}</p>
          </>
        )}
        withIt={result && (
          <>
            <p className="row"><Chip tone={hot ? 'bad' : 'ok'}>{hot ? `${hot} of ${rows.length} drifted` : 'all stable'}</Chip>{result.dataset_drift && <Chip tone="bad">dataset drift</Chip>}</p>
            <ul className="dlist">
              {rows.map(r => <li key={r.name} className={r.drift ? 'hot' : ''}><span className="dn">{r.name}</span><Spark col={r} /><span className="dp">{r.drift ? 'drift' : 'ok'}</span></li>)}
            </ul>
          </>
        )}
      />
      <details className="edit">
        <summary>Fine-tune the incoming data</summary>
        <div className="sliders">
          {SLIDERS.map(s => (
            <label key={s.key}><span>{s.label} <strong>{s.show(knobs[s.key])}</strong></span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={knobs[s.key]} onChange={e => { setScene(-1); setKnobs({ ...knobs, [s.key]: Number(e.target.value) }); }} /></label>
          ))}
        </div>
      </details>
    </div>
  );
}
