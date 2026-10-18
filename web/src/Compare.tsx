import type { ReactNode } from 'react';

/** The same situation twice: what happens without the toolbox, and with it. */
export function Compare({ without, withIt }: { without: ReactNode; withIt: ReactNode }) {
  return (
    <div className="compare">
      <section className="side without" aria-label="Without the toolbox">
        <h4><span className="mark" aria-hidden="true">✕</span>Without the toolbox</h4>
        <div className="side-body">{without}</div>
      </section>
      <section className="side with" aria-label="With the toolbox">
        <h4><span className="mark" aria-hidden="true">✓</span>With the toolbox</h4>
        <div className="side-body">{withIt}</div>
      </section>
    </div>
  );
}
