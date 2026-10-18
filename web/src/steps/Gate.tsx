import { useEffect, useRef, useState } from 'react';
import { gate, type GateResult } from '../api';
import { Compare } from '../Compare';
import { Chip, Seg, useDebounced } from '../ui';

const IDEAS = ['f1_macro>=0.85', 'accuracy>=0.9', 'f1_mcro>=0.85'];

export function GateStep() {
  const [version, setVersion] = useState<'1' | '2'>('2');
  const [expr, setExpr] = useState('f1_macro>=0.85');
  const [result, setResult] = useState<GateResult | null>(null);
  const settled = useDebounced({ version, expr }, 200);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    gate(settled.version, [settled.expr]).then(r => { if (mine === seq.current) setResult(r); }).catch(() => undefined);
  }, [settled]);

  const code = result?.exit_code;
  const f1 = result?.lines.find(l => l.includes('f1_macro ='))?.match(/f1_macro = ([\d.]+)/)?.[1];
  return (
    <div className="stack">
      <div className="gatebar">
        <Seg label="Which model is up for merging" value={version} onChange={setVersion} options={[{ value: '1', label: 'v1 · strong' }, { value: '2', label: 'v2 · weaker candidate' }]} />
        <input className="expr" value={expr} onChange={e => setExpr(e.target.value)} aria-label="Quality bar" spellCheck={false} autoComplete="off" />
      </div>
      <div className="ideas" role="group" aria-label="Try a bar"><span className="muted small">Try:</span>{IDEAS.map(x => <button key={x} type="button" className="idea" onClick={() => setExpr(x)}><code>{x}</code></button>)}</div>
      <Compare
        without={result && (
          <>
            <p className="row"><Chip tone="warn">merged</Chip></p>
            <p className="warnline">{version === '2' ? <>Nothing checks the score, so the weaker model{f1 ? <> (f1 {Number(f1).toFixed(2)})</> : ''} goes to production.</> : 'It merges, and you hope it is fine. Nothing was checked.'}</p>
          </>
        )}
        withIt={result && (
          <>
            <div className="terminal" role="log" aria-live="polite">
              <p className="pl">$ mt gate "{expr}" --model loan-approval --version {version}</p>
              {result.lines.slice(1).map((l, i) => <p key={i} className={l.includes('[PASS]') || l.startsWith('All') ? 'pass' : 'fail'}>{l}</p>)}
            </div>
            <div className={`pr ${code === 0 ? 'ok' : 'bad'}`}>
              <span className="pr-i" aria-hidden="true">{code === 0 ? '✓' : '✕'}</span>
              <span><strong>model-ci / quality gate</strong> {code === 0 ? 'passed: can merge' : code === 1 ? 'failed: merge blocked' : 'could not run'}</span>
            </div>
          </>
        )}
      />
    </div>
  );
}
