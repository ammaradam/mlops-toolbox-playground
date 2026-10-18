import { useEffect, useRef, useState } from 'react';
import { gate, type GateResult } from '../api';
import { Chip, Seg, useDebounced } from '../ui';

const IDEAS = ['f1_macro>=0.85', 'accuracy>=0.9', 'precision_macro>0.8', 'f1_mcro>=0.85'];

export function GatePanel() {
  const [version, setVersion] = useState<'1' | '2'>('1');
  const [exprs, setExprs] = useState<string[]>(['f1_macro>=0.85']);
  const [result, setResult] = useState<GateResult | null>(null);
  const settled = useDebounced({ version, exprs }, 220);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    gate(settled.version, settled.exprs).then(r => { if (mine === seq.current) setResult(r); }).catch(() => undefined);
  }, [settled]);

  const set = (i: number, v: string) => setExprs(exprs.map((e, k) => (k === i ? v : e)));
  const code = result?.exit_code;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>CI quality gate</h2>
        <p className="muted"><code>check_gates()</code> turns model quality into a pass or fail. The terminal output below is what <code>mt gate</code> prints, and the exit code is what your pipeline sees.</p>
      </div>
      <div className="two">
        <div className="tile">
          <h3>Gate this model</h3>
          <Seg label="Model version" value={version} onChange={setVersion} options={[{ value: '1', label: 'v1 · production' }, { value: '2', label: 'v2 · candidate' }]} />
          <div className="exprs">
            {exprs.map((e, i) => (
              <div key={i} className="expr">
                <input value={e} onChange={ev => set(i, ev.target.value)} aria-label={`Gate ${i + 1}`} spellCheck={false} autoComplete="off" />
                {exprs.length > 1 && <button type="button" className="x" aria-label="Remove this gate" onClick={() => setExprs(exprs.filter((_, k) => k !== i))}>×</button>}
              </div>
            ))}
            {exprs.length < 4 && <button type="button" className="btn small" onClick={() => setExprs([...exprs, 'accuracy>=0.9'])}>Add a gate</button>}
          </div>
          <p className="muted small">Try one:</p>
          <div className="ideas">{IDEAS.map(x => <button key={x} type="button" className="idea" onClick={() => setExprs([x])}><code>{x}</code></button>)}</div>
        </div>
        <div className="tile">
          <h3>Result {result && <Chip tone={code === 0 ? 'ok' : code === 1 ? 'bad' : 'warn'}>exit {code}</Chip>}</h3>
          <div className="terminal" role="log" aria-live="polite">
            <p className="prompt-line">$ mt gate {exprs.map(e => `"${e}"`).join(' ')} --model loan-approval --version {version}</p>
            {result?.lines.map((l, i) => <p key={i} className={l.includes('[PASS]') ? 'pass' : l.includes('[FAIL]') || l.startsWith('Gate check') || l.startsWith('Error') ? 'fail' : l.startsWith('All gates') ? 'pass' : ''}>{l}</p>)}
          </div>
          {result && (
            <div className={`pr-check ${code === 0 ? 'ok' : 'bad'}`}>
              <span className="pr-icon" aria-hidden="true">{code === 0 ? '✓' : '✕'}</span>
              <div><strong>model-ci / quality gate</strong><span>{code === 0 ? 'Passed. This pull request can merge.' : code === 1 ? 'Failed. This pull request is blocked from merging.' : 'The gate could not run: fix the expression.'}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
