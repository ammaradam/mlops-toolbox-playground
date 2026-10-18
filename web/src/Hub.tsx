export type TabId = 'contract' | 'serve' | 'score' | 'drift' | 'gate' | 'card' | 'ship';

export const SPOKES: { id: Exclude<TabId, 'contract'>; title: string; cmd: string; blurb: string }[] = [
  { id: 'serve', title: 'Typed serving', cmd: 'mt serve', blurb: 'Bad requests get a 422' },
  { id: 'score', title: 'Batch scoring', cmd: 'mt score', blurb: 'Rows checked on the way in' },
  { id: 'drift', title: 'Drift', cmd: 'mt drift', blurb: 'No training data needed' },
  { id: 'gate', title: 'CI gate', cmd: 'mt gate', blurb: 'Quality as a failing check' },
  { id: 'card', title: 'Model card', cmd: 'mt card', blurb: 'Written from the registry' },
  { id: 'ship', title: 'Ship', cmd: 'mt ship', blurb: 'A folder that runs anywhere' },
];

interface Props {
  active: TabId;
  registered: boolean;
  pulse: number; // changes whenever the contract "sends" something, to replay the animation
  onSelect: (t: TabId) => void;
}

/** The contract at the top, one line out to every feature that reads it. */
export function Hub({ active, registered, pulse, onSelect }: Props) {
  return (
    <div className={`hub ${registered ? 'live' : 'locked'}`}>
      <button type="button" className={`hub-contract ${active === 'contract' ? 'on' : ''}`} onClick={() => onSelect('contract')} aria-pressed={active === 'contract'}>
        <span className="hc-title">{registered ? 'Model contract' : 'Register a model'}</span>
        <span className="hc-sub">{registered ? 'schema · ranges · metrics · drift baseline' : 'to create its contract'}</span>
      </button>
      <div className="hub-bus" aria-hidden="true">
        <span className="bus-line" />
        {registered && <span key={pulse} className="bus-pulse" />}
      </div>
      <ul className="hub-spokes" aria-label="What the contract drives">
        {SPOKES.map(s => (
          <li key={s.id}>
            <button type="button" disabled={!registered} className={`spoke ${active === s.id ? 'on' : ''}`} aria-pressed={active === s.id}
              onClick={() => onSelect(s.id)} title={registered ? undefined : 'Register the model first'}>
              <span className="stub" aria-hidden="true" />
              <span className="sp-title">{s.title}</span>
              <span className="sp-cmd">{s.cmd}</span>
              <span className="sp-blurb">{s.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
