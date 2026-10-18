import { useEffect, useState } from 'react';
import { getShip, type ShipResult } from '../api';

export function ShipPanel() {
  const [ship, setShip] = useState<ShipResult | null>(null);
  const [open, setOpen] = useState('contract.json');
  useEffect(() => { getShip().then(setShip).catch(() => undefined); }, []);
  const file = ship?.files.find(f => f.path === open);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Ship it</h2>
        <p className="muted"><code>mt ship loan-approval</code> writes a self-contained folder. These are the real files, generated from the toolbox's own templates and this model's contract.</p>
      </div>
      <div className="two ship">
        <div className="tile tree">
          <h3>deploy/{ship?.name ?? 'loan-approval'}/</h3>
          <ul role="tree">
            {ship?.files.map(f => <li key={f.path}><button type="button" className={open === f.path ? 'on' : ''} onClick={() => setOpen(f.path)}><span aria-hidden="true">📄</span>{f.path}</button></li>)}
            <li className="omitted"><span aria-hidden="true">📁</span>model/ <em>not shown</em></li>
          </ul>
          {ship && <p className="muted small">{ship.omitted}</p>}
        </div>
        <div className="tile viewer">
          <h3>{file?.path} <span className="muted small">{file?.note}</span></h3>
          <pre className="code tall">{file?.content}</pre>
        </div>
      </div>
      <p className="muted small">Then <code>uvicorn serve:app</code> or <code>docker build</code>. No tracking store is needed at runtime.</p>
    </div>
  );
}
