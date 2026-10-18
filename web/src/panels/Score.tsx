import { useEffect, useRef, useState } from 'react';
import { score, type ScoreResult } from '../api';
import { Chip } from '../ui';

const HEAD = 'age,income,employment,credit_history,loan_amount';
const CLEAN = `${HEAD}\n34,62000,salaried,good,12000\n29,41000,student,fair,5000\n52,98000,self-employed,good,30000\n61,27000,retired,poor,9000`;
const PRESETS = [
  { label: 'Clean batch', hint: '4 valid rows', csv: CLEAN },
  { label: 'Unknown category', hint: 'one row has "astronaut"', csv: `${CLEAN}\n38,70000,astronaut,good,15000` },
  { label: 'Missing column', hint: 'no loan_amount', csv: 'age,income,employment,credit_history\n34,62000,salaried,good\n29,41000,student,fair' },
  { label: 'Wrong type', hint: 'income is text', csv: `${HEAD}\n34,sixty thousand,salaried,good,12000` },
];

export function ScorePanel() {
  const [csv, setCsv] = useState(CLEAN);
  const [preset, setPreset] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const run = async (text: string) => {
    const mine = ++seq.current;
    try { const r = await score(text); if (mine === seq.current) { setResult(r); setError(''); } }
    catch (e) { if (mine === seq.current) setError((e as Error).message); }
  };
  useEffect(() => { run(CLEAN); }, []);
  const apply = (i: number) => { setPreset(i); setCsv(PRESETS[i].csv); run(PRESETS[i].csv); };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Batch scoring</h2>
        <p className="muted"><code>score_dataframe()</code> checks every row against the contract before the model runs, then appends predictions. Edit the CSV or pick a case.</p>
      </div>
      <div className="presets" role="group" aria-label="Try a batch">
        {PRESETS.map((p, i) => <button key={p.label} type="button" className={`preset ${preset === i ? 'on' : ''}`} onClick={() => apply(i)}><strong>{p.label}</strong><span>{p.hint}</span></button>)}
      </div>
      <div className="two">
        <div className="tile">
          <h3>Input CSV</h3>
          <textarea className="code area" value={csv} spellCheck={false} aria-label="CSV to score" onChange={e => { setCsv(e.target.value); setPreset(-1); }} rows={8} />
          <button type="button" className="btn primary" onClick={() => run(csv)}>Score it</button>
        </div>
        <div className="tile">
          <h3>Result {result && <Chip tone={result.ok ? 'ok' : 'bad'}>{result.ok ? `scored ${result.n} rows` : 'rejected before the model ran'}</Chip>}</h3>
          {error && <p className="error" role="alert">{error}</p>}
          {result?.ok && (
            <div className="table-wrap">
              <table className="grid-table">
                <thead><tr>{result.columns!.map(c => <th key={c} className={c === 'prediction' ? 'pred' : ''}>{c}</th>)}</tr></thead>
                <tbody>{result.rows.map((r, i) => <tr key={i}>{result.columns!.map(c => <td key={c} className={c === 'prediction' ? 'pred' : ''}>{c === 'prediction' ? <span className={`badge ${r[c]}`}>{r[c]}</span> : String(r[c])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {result && !result.ok && (
            <>
              <ul className="errors" aria-label="Contract violations">{result.problems.map((p, i) => <li key={i}><span>{p}</span></li>)}</ul>
              <div className="contrast">
                <p className="muted small"><strong>Without the contract</strong>, the bare model would have:</p>
                {result.unchecked?.predictions && <p className="silent">scored the rows anyway: {result.unchecked.predictions.map((p, i) => <span key={i} className={`badge ${p}`}>{p}</span>)} <em>No error, and no way to know the input was wrong.</em></p>}
                {result.unchecked?.error && <p className="silent"><code>{result.unchecked.error}</code></p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
