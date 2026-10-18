export interface ColumnSpec { name: string; dtype: string; categories: string[] | null; min_value: number | null; max_value: number | null }
export interface Evaluation { task_type: string; metrics: Record<string, number>; n_samples: number }
export interface Contract { input_columns: ColumnSpec[]; output: { dtype: string; labels: string[] | null } | null; evaluation: Evaluation | null; task_type: string | null }
export interface ModelView { name: string; version: string; aliases: string[]; uri: string; contract: Contract | null; reference_rows: number; has_baseline: boolean }
export interface Step { id: string; title: string; call: string; detail: string; ms: number }

export interface Hist { labels: string[]; ref: number[]; cur: number[]; kind: 'numeric' | 'category' }
export interface DriftColumn extends Hist { name: string; psi: number; drift: boolean }
export interface DriftResult {
  threshold: number; n_current: number; dataset_drift: boolean; drift_share: number;
  columns: DriftColumn[]; prediction: DriftColumn & { approval_ref: number; approval_cur: number };
}
export interface DriftKnobs { income_shift: number; loan_scale: number; student_share: number; poor_share: number }

export interface ScoreResult {
  ok: boolean; problems: string[]; rows: Record<string, string | number>[]; columns?: string[]; n?: number;
  unchecked?: { predictions?: string[]; error?: string };
}
export interface GateResult { exit_code: number; passed: boolean; lines: string[]; checks: { expression: string; passed: boolean }[] }
export interface ShipFile { path: string; content: string; note: string }
export interface ShipResult { name: string; version: string; files: ShipFile[]; omitted: string }
export interface PredictReply { status: number; body: { predictions?: string[]; detail?: { loc: (string | number)[]; msg: string }[] } }

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`The server answered ${res.status}. Is the API running?`);
  return res.json() as Promise<T>;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const getModel = () => fetch('/api/model').then(r => ok<{ versions: ModelView[] }>(r));
export const register = () => post('/api/register', {}).then(r => ok<{ steps: Step[]; model: ModelView }>(r));
export const predict = async (records: Record<string, unknown>[]): Promise<PredictReply> => {
  const res = await post('/api/model/predict', { records });
  return { status: res.status, body: await res.json() };
};
export const score = (csv: string) => post('/api/score', { csv }).then(r => ok<ScoreResult>(r));
export const drift = (k: DriftKnobs) => post('/api/drift', k).then(r => ok<DriftResult>(r));
export const gate = (version: string, expressions: string[]) => post('/api/gate', { version, expressions }).then(r => ok<GateResult>(r));
export const getCard = (version: string) => fetch(`/api/card?version=${version}`).then(r => ok<{ markdown: string }>(r));
export const getShip = () => fetch('/api/ship').then(r => ok<ShipResult>(r));

export const bare = (record: Record<string, unknown>) =>
  post('/api/bare', { record }).then(r => ok<{ ok: boolean; prediction?: string; error?: string }>(r));
