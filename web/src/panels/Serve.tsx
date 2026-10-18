import { useEffect, useRef, useState } from 'react';
import { predict, type ModelView, type PredictReply } from '../api';
import { Chip } from '../ui';

const VALID: Record<string, string> = { age: '34', income: '62000', employment: 'salaried', credit_history: 'good', loan_amount: '12000' };
const PRESETS: { label: string; hint: string; values: Record<string, string> }[] = [
  { label: 'Valid request', hint: 'Matches the contract', values: VALID },
  { label: 'Wrong type', hint: 'income is text', values: { ...VALID, income: 'lots' } },
  { label: 'Unknown category', hint: 'employment: astronaut', values: { ...VALID, employment: 'astronaut' } },
  { label: 'Missing field', hint: 'no age', values: { ...VALID, age: '' } },
];

/** Numbers stay numbers, everything else is sent exactly as typed, and empty means "left out". */
function toRecord(values: Record<string, string>) {
  const rec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v.trim() === '') continue;
    rec[k] = /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  }
  return rec;
}

export function ServePanel({ model }: { model: ModelView }) {
  const columns = model.contract?.input_columns ?? [];
  const [values, setValues] = useState<Record<string, string>>(VALID);
  const [reply, setReply] = useState<PredictReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState(0);
  const seq = useRef(0);
  const record = toRecord(values);

  const send = async (v: Record<string, string>) => {
    const mine = ++seq.current;
    setBusy(true);
    const r = await predict([toRecord(v)]).catch(() => null);
    if (mine === seq.current) { setReply(r); setBusy(false); }
  };
  useEffect(() => { send(VALID); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const apply = (i: number) => { setPreset(i); setValues(PRESETS[i].values); send(PRESETS[i].values); };
  const hint = (c: (typeof columns)[number]) => c.categories ? c.categories.join(' · ') : c.min_value !== null ? `${c.min_value.toLocaleString()} to ${c.max_value?.toLocaleString()}` : c.dtype;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Typed serving</h2>
        <p className="muted">The request schema is built from the contract. This is the toolbox's own model server, the one <code>mt serve</code> runs. Anything off-contract is refused with a 422, not a stack trace.</p>
      </div>
      <div className="presets" role="group" aria-label="Try a request">
        {PRESETS.map((p, i) => (
          <button key={p.label} type="button" className={`preset ${preset === i ? 'on' : ''}`} onClick={() => apply(i)}><strong>{p.label}</strong><span>{p.hint}</span></button>
        ))}
      </div>
      <div className="two">
        <form className="tile form" onSubmit={e => { e.preventDefault(); send(values); }}>
          <h3>Request</h3>
          {columns.map(c => (
            <label key={c.name} className="field">
              <span className="f-name">{c.name} <em>{c.dtype}</em></span>
              <input value={values[c.name] ?? ''} onChange={e => { setPreset(-1); setValues({ ...values, [c.name]: e.target.value }); }} autoComplete="off" spellCheck={false} placeholder="(leave out)" />
              <span className="f-hint">{hint(c)}</span>
            </label>
          ))}
          <button type="submit" className="btn primary" disabled={busy}>Send to /predict</button>
        </form>
        <div className="tile wire">
          <h3>On the wire</h3>
          <p className="verb"><code>POST /predict</code></p>
          <pre className="code">{JSON.stringify({ records: [record] }, null, 2)}</pre>
          <p className="verb">
            <code>Response</code>
            {reply ? <Chip tone={reply.status === 200 ? 'ok' : 'bad'}>{reply.status === 200 ? '200 OK' : `${reply.status} Unprocessable`}</Chip> : <Chip tone="idle">{busy ? 'sending…' : 'no reply'}</Chip>}
          </p>
          {reply?.status === 200 && reply.body.predictions && (
            <div className="answer good"><span>Decision</span><strong>{reply.body.predictions[0]}</strong></div>
          )}
          {reply && reply.status !== 200 && reply.body.detail && (
            <ul className="errors" aria-label="Validation errors">
              {reply.body.detail.map((d, i) => (
                <li key={i}><code>{String(d.loc[d.loc.length - 1])}</code><span>{d.msg}</span></li>
              ))}
            </ul>
          )}
          <p className="muted small">Without a contract this bare model would take any of these and answer anyway.</p>
        </div>
      </div>
    </div>
  );
}
