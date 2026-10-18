export type StepId = 'register' | 'serve' | 'score' | 'watch' | 'gate' | 'ship';
export type Part = 'inputs' | 'metrics' | 'baseline' | 'output';

export interface StepInfo {
  id: StepId; label: string; title: string; cmd: string;
  problem: string; does: string; uses: Part[];
}

export const PARTS: { id: Part; label: string; what: string }[] = [
  { id: 'inputs', label: 'Inputs', what: 'columns, types, allowed values' },
  { id: 'metrics', label: 'Scores', what: 'how well it did on test data' },
  { id: 'baseline', label: 'Baseline', what: 'what normal data and answers look like' },
  { id: 'output', label: 'Outputs', what: 'the answers it can give' },
];

export const STEPS: StepInfo[] = [
  { id: 'register', label: 'Register', title: 'Give the model a contract', cmd: 'register_model()',
    problem: 'A trained model is just a file. Nothing records what it expects, how good it was, or what normal data looks like.',
    does: 'Registering stores a contract with the model: its inputs, scores and baseline. Think of it as the model’s passport.',
    uses: ['inputs', 'metrics', 'baseline', 'output'] },
  { id: 'serve', label: 'Serve', title: 'Refuse bad requests', cmd: 'mt serve',
    problem: 'Someone sends a request the model was never built for. It answers anyway, and nobody can tell the answer is wrong.',
    does: 'The server builds its API from the contract and refuses anything that does not fit, with a clear error.',
    uses: ['inputs'] },
  { id: 'score', label: 'Score', title: 'Check every row first', cmd: 'mt score',
    problem: 'A batch file with a bad column gets scored anyway, or crashes halfway through.',
    does: 'Every row is checked against the contract before the model runs. Bad batches are rejected with the exact problem.',
    uses: ['inputs'] },
  { id: 'watch', label: 'Watch', title: 'Notice when data changes', cmd: 'mt drift',
    problem: 'Real-world data slowly changes, and the model quietly gets worse. Nobody is alerted.',
    does: 'The contract carries a baseline of normal data and answers, so drift is checked later without the training data.',
    uses: ['baseline'] },
  { id: 'gate', label: 'Gate', title: 'Block a worse model', cmd: 'mt gate',
    problem: 'A weaker model slips into production because nobody checks its scores before the merge.',
    does: 'The contract keeps the model’s scores, so CI can fail a pull request that does not meet your bar.',
    uses: ['metrics'] },
  { id: 'ship', label: 'Ship', title: 'Document and package it', cmd: 'mt card · mt ship',
    problem: 'Docs and deployment files are written by hand, and drift away from the model.',
    does: 'The model card and a ready-to-run folder are generated from the contract, so they always match.',
    uses: ['inputs', 'metrics', 'baseline', 'output'] },
];
