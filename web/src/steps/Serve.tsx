import { useEffect, useRef, useState } from 'react';
import { bare, predict, type ModelView, type PredictReply } from '../api';
import { Compare } from '../Compare';
import { Chip } from '../ui';

const VALID: Record<string, string> = { age: '34', income: '62000', employment: 'salaried', credit_history: 'good', loan_amount: '12000' };
const PRESETS: { label: string; hint: string; values: Record<string, string> }[] = [
  { label: 'Valid', hint: 'fits the contract', values: VALID },
  { label: 'Wrong type', hint: 'income: “lots”', values: { ...VALID, income: 'lots' } },
  { label: 'Unknown value', hint: 'employment: astronaut', values: { ...VALID, employment: 'astronaut' } },
  { label: 'Missing field', hint: 'no age', values: { ...VALID, age: '' } },
];

function toRecord(values: Record<string, string>) {
  const rec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v.trim() === '') continue;
    rec[k] = /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  }
  return rec;
}

type Bare = { ok: boolean; prediction?: string; error?: string } | null;

export function ServeStep({ model }: { model: ModelView }) {
  const columns = model.contract?.input_columns ?? [];
  const [values, setValues] = useState(VALID);
  const [preset, setPreset] = useState(0);
  const [reply, setReply] = useState<PredictReply | null>(null);
  const [plain, setPlain] = useState<Bare>(null);
  const seq = useRef(0);

  const send = async (v: Record<string, string>) => {
    const mine = ++seq.current;
    const rec = toRecord(v);
    const [a, b] = await Promise.all([predict([rec]).catch(() => null), bare(rec).catch(() => null)]);
    if (mine === seq.current) { setReply(a); setPlain(b); }
  };
  useEffect(() => { send(VALID); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const apply = (i: number) => { setPreset(i); setValues(PRESETS[i].values); send(PRESETS[i].values); };
  const bad = preset !== 0;

  return (
    <div className="stack">
      <div className="presets" role="group" aria-label="Try a request">
        {PRESETS.map((p, i) => <button key={p.label} type="button" className={`preset ${preset === i ? 'on' : ''}`} onClick={() => apply(i)}><strong>{p.label}</strong><span>{p.hint}</span></button>)}
      </div>
      <p className="request"><span>Request</span><code>{JSON.stringify(toRecord(values)).replace(/,/g, ', ')}</code></p>
      <Compare
        without={plain && (plain.ok ? (
          <>
            <p className="row"><Chip tone={bad ? 'warn' : 'ok'}>200 OK</Chip><strong className="big">{plain.prediction}</strong></p>
            <p className={bad ? 'warnline' : 'muted'}>{bad ? 'It answered anyway. Nothing says this input was wrong.' : 'Fine, because the input was fine.'}</p>
          </>
        ) : (
          <>
            <p className="row"><Chip tone="bad">Crash</Chip></p>
            <p className="warnline"><code>{plain.error}</code></p>
          </>
        ))}
        withIt={reply && (reply.status === 200 ? (
          <>
            <p className="row"><Chip tone="ok">200 OK</Chip><strong className="big">{reply.body.predictions?.[0]}</strong></p>
            <p className="muted">Accepted: it matches the contract.</p>
          </>
        ) : (
          <>
            <p className="row"><Chip tone="bad">422 refused</Chip></p>
            <ul className="errs">{reply.body.detail?.slice(0, 3).map((d, i) => <li key={i}><code>{String(d.loc[d.loc.length - 1])}</code> {d.msg}</li>)}</ul>
          </>
        ))}
      />
      <details className="edit">
        <summary>Edit the request yourself</summary>
        <form className="fields" onSubmit={e => { e.preventDefault(); send(values); }}>
          {columns.map(c => (
            <label key={c.name}><span>{c.name}</span>
              <input value={values[c.name] ?? ''} onChange={e => { setPreset(-1); setValues({ ...values, [c.name]: e.target.value }); }} autoComplete="off" spellCheck={false} placeholder="(leave out)" /></label>
          ))}
          <button type="submit" className="btn primary small">Send</button>
        </form>
      </details>
    </div>
  );
}
