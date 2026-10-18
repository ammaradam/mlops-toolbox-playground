import { useEffect, useRef, useState } from 'react';
import { score, type ScoreResult } from '../api';
import { Compare } from '../Compare';
import { Chip } from '../ui';

const HEAD = 'age,income,employment,credit_history,loan_amount';
const CLEAN = `${HEAD}\n34,62000,salaried,good,12000\n29,41000,student,fair,5000\n52,98000,self-employed,good,30000\n61,27000,retired,poor,9000`;
const PRESETS = [
  { label: 'Clean batch', hint: '4 valid rows', csv: CLEAN },
  { label: 'Unknown value', hint: 'one row says “astronaut”', csv: `${CLEAN}\n38,70000,astronaut,good,15000` },
  { label: 'Missing column', hint: 'no loan_amount', csv: 'age,income,employment,credit_history\n34,62000,salaried,good\n29,41000,student,fair' },
  { label: 'Wrong type', hint: 'income is text', csv: `${HEAD}\n34,sixty thousand,salaried,good,12000` },
];

export function ScoreStep() {
  const [csv, setCsv] = useState(CLEAN);
  const [preset, setPreset] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const seq = useRef(0);
  const run = async (text: string) => {
    const mine = ++seq.current;
    const r = await score(text).catch(() => null);
    if (mine === seq.current) setResult(r);
  };
  useEffect(() => { run(CLEAN); }, []);
  const apply = (i: number) => { setPreset(i); setCsv(PRESETS[i].csv); run(PRESETS[i].csv); };

  const badges = (xs: string[]) => <span className="badges">{xs.map((p, i) => <span key={i} className={`badge ${p}`}>{p}</span>)}</span>;
  return (
    <div className="stack">
      <div className="presets" role="group" aria-label="Try a batch">
        {PRESETS.map((p, i) => <button key={p.label} type="button" className={`preset ${preset === i ? 'on' : ''}`} onClick={() => apply(i)}><strong>{p.label}</strong><span>{p.hint}</span></button>)}
      </div>
      <Compare
        without={result && (result.ok ? (
          <><p className="row"><Chip tone="ok">scored</Chip></p><p className="muted">Fine, because the batch was fine.</p></>
        ) : result.unchecked?.predictions ? (
          <>
            <p className="row"><Chip tone="warn">scored anyway</Chip>{badges(result.unchecked.predictions)}</p>
            <p className="warnline">No error. The bad row got an answer like the others.</p>
          </>
        ) : (
          <><p className="row"><Chip tone="bad">crashed</Chip></p><p className="warnline"><code>{result.unchecked?.error}</code></p></>
        ))}
        withIt={result && (result.ok ? (
          <><p className="row"><Chip tone="ok">scored {result.n} rows</Chip>{badges(result.rows.map(r => String(r.prediction)))}</p><p className="muted">Every row passed the contract first.</p></>
        ) : (
          <>
            <p className="row"><Chip tone="bad">rejected</Chip></p>
            <ul className="errs">{result.problems.slice(0, 2).map((p, i) => <li key={i}>{p}</li>)}</ul>
            <p className="muted small">Nothing was scored.</p>
          </>
        ))}
      />
      <details className="edit">
        <summary>Edit the CSV yourself</summary>
        <textarea className="area" value={csv} spellCheck={false} rows={5} aria-label="CSV to score" onChange={e => { setCsv(e.target.value); setPreset(-1); }} />
        <button type="button" className="btn primary small" onClick={() => run(csv)}>Score it</button>
      </details>
    </div>
  );
}
