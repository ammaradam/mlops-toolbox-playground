import { useState } from 'react';
import { register, type ModelView, type Step } from '../api';
import { Chip, sleep } from '../ui';

interface Props { model: ModelView | null; onRegistered: (m: ModelView) => void }

const PREVIEW: Pick<Step, 'id' | 'title' | 'call'>[] = [
  { id: 'train', title: 'Train the model', call: 'your training code' },
  { id: 'evaluate', title: 'Score it on test data', call: 'mt.ClassificationEvaluator().evaluate(...)' },
  { id: 'contract', title: 'Write the contract', call: 'mt.infer_contract(X_train, y=y_train, evaluation=report)' },
  { id: 'register', title: 'Register it with the contract', call: 'registry.register_model(model, contract=..., reference_data=X_train)' },
  { id: 'alias', title: 'Mark it as production', call: 'registry.set_alias("loan-approval", "1", "production")' },
];

function knows(c: { categories: string[] | null; min_value: number | null; max_value: number | null }) {
  if (c.categories) return c.categories.join(', ');
  if (c.min_value !== null && c.max_value !== null) return `${c.min_value.toLocaleString()} to ${c.max_value.toLocaleString()}`;
  return 'any';
}

export function RegisterStep({ model, onRegistered }: Props) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true); setError(''); setShown(0);
    try {
      const r = await register();
      setSteps(r.steps);
      for (let i = 0; i < r.steps.length; i++) { setShown(i + 1); await sleep(750); }
      onRegistered(r.model);
    } catch (e) { setError((e as Error).message); }
    setRunning(false);
  };

  const list = steps.length ? steps : PREVIEW;
  const contract = model?.contract;
  return (
    <div className="split">
      <div className={`card pipeline ${model && !running ? 'collapsed' : ''}`}>
        <h3>What registering does</h3>
        {model && !running && <p className="sumline">✓ Trained, scored, wrote the contract and registered it.</p>}
        <ol className="steps">
          {list.map((s, i) => {
            const state = !steps.length ? 'idle' : i < shown - 1 || (i === shown - 1 && !running) ? 'done' : i === shown - 1 ? 'active' : 'wait';
            const detail = 'detail' in s ? (s as Step).detail : '';
            return (
              <li key={s.id} className={`step ${state}`} title={s.call}>
                <span className="step-dot" aria-hidden="true" />
                <div><p className="step-title">{s.title}{'ms' in s && state === 'done' && <span className="ms">{(s as Step).ms} ms</span>}</p>
                  {state === 'active' && detail && <p className="step-detail">{detail}</p>}</div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn primary" onClick={run} disabled={running}>{running ? 'Registering…' : model ? 'Run it again' : 'Register the model'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="card contract">
        <h3>The contract <span className="muted small">stored with the model</span></h3>
        {contract && model && (!running || shown >= steps.length) ? (
          <div className="reveal">
            <div className="tags">{model.aliases.map(a => <Chip key={a} tone="ok">{a}</Chip>)}<Chip tone="idle">{model.reference_rows.toLocaleString()} baseline rows</Chip></div>
            <table className="mini">
              <tbody>
                {contract.input_columns.map(c => <tr key={c.name}><td><code>{c.name}</code></td><td className="t">{c.dtype}</td><td className="k">{knows(c)}</td></tr>)}
                {contract.output && <tr className="out"><td>answers</td><td className="t">{contract.output.dtype}</td><td className="k">{contract.output.labels?.join(', ')}</td></tr>}
              </tbody>
            </table>
            {contract.evaluation && <div className="chips">{['accuracy', 'f1_macro'].map(k => <span key={k} className="stat"><em>{k}</em><strong>{contract.evaluation!.metrics[k].toFixed(2)}</strong></span>)}<span className="stat"><em>tested on</em><strong>{contract.evaluation.n_samples} rows</strong></span></div>}
          </div>
        ) : (
          <div className="empty"><p>Nothing registered yet.</p><p className="muted small">Press the button. The contract appears here, built from real data.</p></div>
        )}
      </div>
    </div>
  );
}
