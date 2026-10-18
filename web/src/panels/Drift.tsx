import { useEffect, useRef, useState } from 'react';
import { drift, type DriftColumn, type DriftKnobs, type DriftResult } from '../api';
import { Chip, pct, useDebounced } from '../ui';

const BASE: DriftKnobs = { income_shift: 0, loan_scale: 1, student_share: 0.08, poor_share: 0.15 };
const SCENES: { label: string; hint: string; knobs: DriftKnobs }[] = [
  { label: 'Same as training', hint: 'No shift', knobs: BASE },
  { label: 'Recession', hint: 'Incomes −30%, poor credit up, bigger loans', knobs: { ...BASE, income_shift: -0.3, poor_share: 0.4, loan_scale: 1.4 } },
  { label: 'Student campaign', hint: '40% students', knobs: { ...BASE, student_share: 0.4 } },
  { label: 'Bigger loans', hint: 'Loan sizes ×1.6', knobs: { ...BASE, loan_scale: 1.6 } },
];
const SLIDERS: { key: keyof DriftKnobs; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: 'income_shift', label: 'Applicant income', min: -0.5, max: 0.5, step: 0.05, show: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },
  { key: 'loan_scale', label: 'Loan size', min: 0.6, max: 1.8, step: 0.1, show: v => `×${v.toFixed(1)}` },
  { key: 'student_share', label: 'Students in the mix', min: 0, max: 0.6, step: 0.02, show: pct },
  { key: 'poor_share', label: 'Poor credit in the mix', min: 0, max: 0.6, step: 0.02, show: pct },
];

function Bars({ col }: { col: DriftColumn }) {
  const peak = Math.max(...col.ref, ...col.cur, 0.01);
  return (
    <div className={`bars ${col.kind}`} role="img" aria-label={`${col.name}: stored baseline versus current data`}>
      {col.labels.map((l, i) => (
        <div key={l} className="bar-pair" title={`${l}: baseline ${pct(col.ref[i])}, now ${pct(col.cur[i])}`}>
          <span className="b ref" style={{ height: `${(col.ref[i] / peak) * 100}%` }} />
          <span className={`b cur ${col.drift ? 'hot' : ''}`} style={{ height: `${(col.cur[i] / peak) * 100}%` }} />
          {col.kind === 'category' && <em>{l.replace('self-employed', 'self-emp.')}</em>}
        </div>
      ))}
    </div>
  );
}

function Card({ col, extra }: { col: DriftColumn; extra?: string }) {
  return (
    <article className={`dcard ${col.drift ? 'hot' : ''}`}>
      <header><h4>{col.name}</h4><Chip tone={col.drift ? 'bad' : 'ok'}>{col.drift ? 'Drift' : 'Stable'}</Chip></header>
      <Bars col={col} />
      <p className="psi">PSI <strong>{col.psi.toFixed(2)}</strong></p>
      {extra && <p className="muted small">{extra}</p>}
    </article>
  );
}

export function DriftPanel() {
  const [knobs, setKnobs] = useState<DriftKnobs>(BASE);
  const [scene, setScene] = useState(0);
  const [result, setResult] = useState<DriftResult | null>(null);
  const [error, setError] = useState('');
  const settled = useDebounced(knobs, 180);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    drift(settled).then(r => { if (mine === seq.current) { setResult(r); setError(''); } })
      .catch(e => { if (mine === seq.current) setError((e as Error).message); });
  }, [settled]);

  const drifted = result?.columns.filter(c => c.drift).map(c => c.name) ?? [];
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Drift, without the training data</h2>
        <p className="muted">The contract's baseline travels with the model: reference rows and baseline predictions. Move the incoming data away from it and watch each column and the predictions react.</p>
      </div>
      <div className="presets" role="group" aria-label="Pick a situation">
        {SCENES.map((s, i) => <button key={s.label} type="button" className={`preset ${scene === i ? 'on' : ''}`} onClick={() => { setScene(i); setKnobs(s.knobs); }}><strong>{s.label}</strong><span>{s.hint}</span></button>)}
      </div>
      <div className="tile sliders">
        {SLIDERS.map(s => (
          <label key={s.key} className="slider">
            <span className="s-top"><span>{s.label}</span><strong>{s.show(knobs[s.key])}</strong></span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={knobs[s.key]} onChange={e => { setScene(-1); setKnobs({ ...knobs, [s.key]: Number(e.target.value) }); }} />
          </label>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <>
          <p className={`summary ${result.dataset_drift ? 'hot' : drifted.length ? 'warn' : 'calm'}`} aria-live="polite">
            {drifted.length === 0 ? 'Nothing has drifted.' : `${drifted.length} of ${result.columns.length} columns drifted: ${drifted.join(', ')}.`}{' '}
            Dataset drift: <strong>{result.dataset_drift ? 'yes' : 'no'}</strong>. Approval rate {pct(result.prediction.approval_ref)} → <strong>{pct(result.prediction.approval_cur)}</strong>.
          </p>
          <div className="dgrid">
            {result.columns.map(c => <Card key={c.name} col={c} />)}
            <Card col={result.prediction} extra={`Approvals ${pct(result.prediction.approval_ref)} → ${pct(result.prediction.approval_cur)}`} />
          </div>
          <p className="legend"><span className="sw ref" /> stored baseline <span className="sw cur" /> incoming data <span className="sw hot" /> drifted · PSI ≥ {result.threshold} · {result.n_current} incoming rows</p>
        </>
      )}
    </div>
  );
}
