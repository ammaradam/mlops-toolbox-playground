import { useEffect, useState } from 'react';
import { getModel, type ModelView } from './api';
import { PARTS, STEPS, type StepId } from './steps';
import { GateStep } from './steps/Gate';
import { RegisterStep } from './steps/Register';
import { ScoreStep } from './steps/Score';
import { ServeStep } from './steps/Serve';
import { ShipStep } from './steps/Ship';
import { WatchStep } from './steps/Watch';

const REPO = 'https://github.com/ammaradam/MLOps-Toolbox';

export default function App() {
  const [idx, setIdx] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [model, setModel] = useState<ModelView | null>(null);
  const [error, setError] = useState('');

  // ?step=watch opens straight onto a step, with the model already registered.
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('step') as StepId | null;
    const i = STEPS.findIndex(s => s.id === wanted);
    if (i > 0) getModel().then(r => { setModel(r.versions[0]); go(i); }).catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (i: number) => {
    setIdx(i);
    setVisited(v => new Set(v).add(i));
    const u = new URL(location.href);
    if (i === 0) u.searchParams.delete('step'); else u.searchParams.set('step', STEPS[i].id);
    history.replaceState(null, '', u);
  };

  const step = STEPS[idx];
  const locked = (i: number) => i > 0 && model === null;
  const last = idx === STEPS.length - 1;
  const blocked = idx === 0 && model === null;

  return (
    <div className="shell">
      <header className="top">
        <h1>MLOps Toolbox <span>Playground</span></h1>
        <p className="lede">A trained model is just a file. <a href={REPO}>mlops-toolbox</a> stores a <strong>contract</strong> with it: what inputs it accepts, how well it scored, and what normal data looks like. Every later step reads that contract instead of being set up again.</p>
        <p className="lede short">One contract travels with the model. Every step reads it.</p>
      </header>

      <nav className="timeline" aria-label="The six steps">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id} className={`${i === idx ? 'now' : ''} ${visited.has(i) && i !== idx ? 'done' : ''}`}>
              <button type="button" disabled={locked(i)} aria-current={i === idx ? 'step' : undefined} onClick={() => go(i)} title={locked(i) ? 'Register the model first' : s.title}>
                <span className="num">{visited.has(i) && i !== idx && !locked(i) ? '✓' : i + 1}</span>
                <span className="lab">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="strip" aria-label="Which part of the contract this step uses">
        <span className="strip-l">{idx === 0 ? 'The contract holds' : 'This step reads'}</span>
        <ul>
          {PARTS.map(p => (
            <li key={p.id} className={`${step.uses.includes(p.id) ? 'used' : 'dim'} ${model || idx === 0 ? '' : 'off'}`} title={p.what}>
              <strong>{p.label}</strong><span>{p.what}</span>
            </li>
          ))}
        </ul>
      </section>

      <main className="stepbody" key={step.id}>
        <div className="story">
          <div><span className="tag problem">The problem</span><p>{step.problem}</p></div>
          <div><span className="tag does">What the toolbox does <code>{step.cmd}</code></span><p>{step.does}</p></div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="demo">
          {step.id === 'register' && <RegisterStep model={model} onRegistered={m => { setModel(m); }} />}
          {model && step.id === 'serve' && <ServeStep model={model} />}
          {model && step.id === 'score' && <ScoreStep />}
          {model && step.id === 'watch' && <WatchStep />}
          {model && step.id === 'gate' && <GateStep />}
          {model && step.id === 'ship' && <ShipStep />}
        </div>
      </main>

      <footer className="pager">
        <button type="button" className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}>‹ Back</button>
        <p className="about">Runs the real mlops-toolbox. The model, registry and drift detector are small stand-ins. <a href={REPO}>About the toolbox</a></p>
        {last
          ? <button type="button" className="btn primary" onClick={() => go(0)}>Start over</button>
          : <button type="button" className="btn primary" onClick={() => go(idx + 1)} disabled={blocked} title={blocked ? 'Register the model to continue' : undefined}>
              {blocked ? 'Register to continue' : `Next: ${STEPS[idx + 1].label} ›`}
            </button>}
      </footer>
    </div>
  );
}
