import { useEffect, useState } from 'react';
import { getCard } from '../api';
import { Markdown } from '../Markdown';
import { Seg } from '../ui';

export function CardPanel() {
  const [version, setVersion] = useState<'1' | '2'>('1');
  const [md, setMd] = useState('');
  const [raw, setRaw] = useState(false);
  useEffect(() => { getCard(version).then(r => setMd(r.markdown)).catch(() => setMd('')); }, [version]);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Model card</h2>
        <p className="muted"><code>generate_model_card()</code> writes the card from what the registry already knows. Nobody fills in a template, so it cannot go stale.</p>
      </div>
      <div className="tile">
        <div className="card-bar">
          <Seg label="Model version" value={version} onChange={setVersion} options={[{ value: '1', label: 'v1 · production' }, { value: '2', label: 'v2 · candidate' }]} />
          <Seg label="View" value={raw ? 'md' : 'view'} onChange={v => setRaw(v === 'md')} options={[{ value: 'view', label: 'Rendered' }, { value: 'md', label: 'Markdown' }]} />
        </div>
        {raw ? <pre className="code">{md}</pre> : <Markdown source={md} />}
      </div>
    </div>
  );
}
