import type { ReactNode } from 'react';

/** Just enough markdown for a model card: headings, tables, paragraphs, **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code>
      : part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
        if (!cells.every(c => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const [head, ...body] = rows;
      const blank = head.every(h => h === '');
      out.push(
        <div className="md-table" key={i}>
          <table>
            {!blank && <thead><tr>{head.map((h, k) => <th key={k}>{inline(h)}</th>)}</tr></thead>}
            <tbody>{(blank ? body : body).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
    } else if (line.startsWith('# ')) out.push(<h3 key={i} className="md-h1">{inline(line.slice(2))}</h3>);
    else if (line.startsWith('## ')) out.push(<h4 key={i} className="md-h2">{inline(line.slice(3))}</h4>);
    else if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="md">{out}</div>;
}
