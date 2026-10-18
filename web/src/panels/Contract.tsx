import { useState } from 'react';
import { register, type ModelView, type Step } from '../api';
import { Chip, sleep } from '../ui';

interface Props {
  model: ModelView | null;
  onRegistered: (m: ModelView) => void;
  onNext: () => void;
}

function constraint(c: { categories: string[] | null; min_value: number | null; max_value: number | null }) {
  if (c.categories) return <>one of {c.categories.map(x => <code key={x}>{x}</code>)}</>;
  if (c.min_value !== null && c.max_value !== null) return <>observed {c.min_value.toLocaleString()} to {c.max_value.toLocaleString()}</>;
  return <>any</>;
}

export function ContractPanel({ model, onRegistered, onNext }: Props) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true); setError(''); setShown(0);
    try {
      const r = await register();
      setSteps(r.steps);
      for (let i = 0; i < r.steps.length; i++) { setShown(i + 1); await sleep(900); }
      onRegistered(r.model);
    } catch (e) { setError((e as Error).message); }
    setRunning(false);
  };

  const contract = model?.contract;
  const idle = steps.length === 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Register once</h2>
        <p className="muted">One <code>register_model()</code> call stores the model together with its contract. Everything on this page reads that contract. Nothing is configured twice.</p>
      </div>

      <div className="register">
        <ol className="steps">
          {(idle ? PREVIEW : steps).map((s, i) => {
            const state = idle ? 'idle' : i < shown - 1 || (i === shown - 1 && !running) ? 'done' : i === shown - 1 ? 'active' : 'wait';
            return (
              <li key={s.id} className={`step ${state}`}>
                <span className="step-dot" aria-hidden="true" />
                <div>
                  <p className="step-title">{s.title} {'ms' in s && state === 'done' && <span className="ms">{(s as Step).ms} ms</span>}</p>
                  <code className="step-call">{s.call}</code>
                  {'detail' in s && state !== 'wait' && state !== 'idle' && <p className="step-detail">{(s as Step).detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="register-cta">
          <button type="button" className="btn primary big" onClick={run} disabled={running}>{running ? 'Registering…' : model ? 'Run it again' : 'Register the model'}</button>
          <p className="muted small">Runs the real pipeline on a synthetic loan-approval dataset.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>

      {contract && model && (!running || shown >= steps.length) && (
        <div className="reveal">
          <div className="contract-card">
            <div className="cc-head">
              <h3>{model.name} <span className="muted">version {model.version}</span></h3>
              <div className="cc-tags">{model.aliases.map(a => <Chip key={a} tone="ok">{a}</Chip>)}<Chip tone="idle">{model.reference_rows.toLocaleString()} reference rows</Chip><Chip tone="idle">baseline predictions</Chip></div>
            </div>
            <div className="table-wrap">
              <table className="grid-table">
                <thead><tr><th>Input column</th><th>Type</th><th>What the contract knows</th></tr></thead>
                <tbody>
                  {contract.input_columns.map(c => <tr key={c.name}><td><code>{c.name}</code></td><td>{c.dtype}</td><td className="cons">{constraint(c)}</td></tr>)}
                  {contract.output && <tr className="out"><td>output</td><td>{contract.output.dtype}</td><td className="cons">labels {contract.output.labels?.map(x => <code key={x}>{x}</code>)}</td></tr>}
                </tbody>
              </table>
            </div>
            {contract.evaluation && (
              <div className="metrics">
                {Object.entries(contract.evaluation.metrics).map(([k, v]) => <div key={k} className="metric"><span>{k}</span><strong>{v.toFixed(3)}</strong></div>)}
                <div className="metric"><span>evaluated on</span><strong>{contract.evaluation.n_samples} rows</strong></div>
              </div>
            )}
          </div>
          <div className="next"><button type="button" className="btn primary" onClick={onNext}>See what the contract unlocks ›</button></div>
        </div>
      )}
    </div>
  );
}

const PREVIEW = [
  { id: 'train', title: 'Train', call: 'your training code' },
  { id: 'evaluate', title: 'Evaluate', call: 'mt.ClassificationEvaluator().evaluate(...)' },
  { id: 'contract', title: 'Infer the contract', call: 'mt.infer_contract(X_train, y=y_train, evaluation=report)' },
  { id: 'register', title: 'Register with the contract', call: 'registry.register_model(model, ..., contract=..., reference_data=X_train)' },
  { id: 'alias', title: 'Point an alias at it', call: 'registry.set_alias("loan-approval", "1", "production")' },
];
