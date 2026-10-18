import { useEffect, useState } from 'react';
import { getModel, type ModelView } from './api';
import { Hub, type TabId } from './Hub';
import { CardPanel } from './panels/Card';
import { ContractPanel } from './panels/Contract';
import { DriftPanel } from './panels/Drift';
import { GatePanel } from './panels/Gate';
import { ScorePanel } from './panels/Score';
import { ServePanel } from './panels/Serve';
import { ShipPanel } from './panels/Ship';

const REPO = 'https://github.com/ammaradam/MLOps-Toolbox';
const TABS: TabId[] = ['contract', 'serve', 'score', 'drift', 'gate', 'card', 'ship'];

export default function App() {
  const [tab, setTab] = useState<TabId>('contract');
  const [model, setModel] = useState<ModelView | null>(null);
  const [pulse, setPulse] = useState(0);
  const [error, setError] = useState('');

  // ?tab=drift opens straight onto a feature, with the model already registered.
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('tab') as TabId | null;
    if (wanted && TABS.includes(wanted) && wanted !== 'contract') {
      getModel().then(r => { setModel(r.versions[0]); setTab(wanted); }).catch(e => setError(e.message));
    }
  }, []);

  const select = (t: TabId) => {
    setTab(t); setPulse(p => p + 1);
    const u = new URL(location.href);
    if (t === 'contract') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
    history.replaceState(null, '', u);
  };

  return (
    <div className="page">
      <header className="top">
        <p className="kicker">Interactive</p>
        <h1>MLOps Toolbox Playground</h1>
        <p className="lede">Register a model once. Watch its contract drive typed serving, batch scoring, drift checks, CI gates, model cards and shipping. It runs the real <a href={REPO}>mlops-toolbox</a> library.</p>
      </header>

      <Hub active={tab} registered={model !== null} pulse={pulse} onSelect={select} />
      {error && <p className="error" role="alert">{error}</p>}

      <main>
        {tab === 'contract' && <ContractPanel model={model} onRegistered={m => { setModel(m); setPulse(p => p + 1); }} onNext={() => select('serve')} />}
        {model && tab === 'serve' && <ServePanel model={model} />}
        {model && tab === 'score' && <ScorePanel />}
        {model && tab === 'drift' && <DriftPanel />}
        {model && tab === 'gate' && <GatePanel />}
        {model && tab === 'card' && <CardPanel />}
        {model && tab === 'ship' && <ShipPanel />}
      </main>

      <footer className="foot">
        <p><strong>What is real:</strong> contract inference, validation, evaluation, gates, model cards, the typed model server and the ship templates are the toolbox's own code. <strong>What is swapped to stay light:</strong> the model is a small numpy logistic regression, the registry keeps versions in memory, and drift uses a numpy PSI detector in place of the Evidently backend. Each one plugs into the toolbox's own interface. The toolbox also has <code>mt init</code>, <code>mt doctor</code> and a multi-project dashboard; see the <a href={REPO}>README</a>.</p>
      </footer>
    </div>
  );
}
