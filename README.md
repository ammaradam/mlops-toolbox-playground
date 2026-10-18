# MLOps Toolbox Playground

Register a model once, then watch its contract drive typed serving, batch scoring, drift checks, CI gates, model cards and shipping. It runs the real [mlops-toolbox](https://github.com/ammaradam/MLOps-Toolbox) library, so what you see is what the library does.

## The idea in one minute

A trained model is just a file. Nothing records what inputs it accepts, how well it scored, or what normal data looks like. So bad requests get answered anyway, a drifting model goes unnoticed, and a worse model can slip into production.

`mlops-toolbox` stores a **contract** with the model when you register it: its inputs, scores and a baseline of normal data. Every later step reads that contract instead of being configured again.

## The walkthrough

Six steps, one screen each. Every step states the problem, what the toolbox does, which part of the contract it reads, and shows the same situation **without** and **with** the toolbox.

| Step | Contract part | Try this | Library code behind it |
|---|---|---|---|
| 1. Register | all of it | Run the pipeline and watch the contract appear | `ClassificationEvaluator`, `infer_contract`, `register_model` |
| 2. Serve | inputs | Send a valid request, then a wrong type, an unknown value, a missing field | the toolbox's own `FastAPIModelServer`, the one `mt serve` runs |
| 3. Score | inputs | Score a CSV, then break it | `score_dataframe`, `validate_against_contract` |
| 4. Watch | baseline | Shift incomes, loan sizes and the customer mix | reference data and predictions stored at registration |
| 5. Gate | scores | Gate a strong v1 and a weaker v2; try a typo | `check_gates`, the output of `mt gate` |
| 6. Ship | everything | Read the model card; browse the files `mt ship` writes | `generate_model_card`, the `mt ship` templates |

Link straight to a step with `?step=serve`, `score`, `watch`, `gate` or `ship`. The page fits one screen on desktop and on a phone.

The toolbox also has `mt init`, `mt doctor` and a multi-project dashboard. They are not in the demo; see the toolbox README.

## What is real, and what is swapped

Real: contract inference, validation, evaluation, gates, model cards, the typed model server and the ship templates.

Swapped, so the demo stays light and runs on serverless Python:

- the **model** is a small logistic regression in numpy (the toolbox adapts any object with `predict()`),
- the **registry** keeps versions in memory (it implements the toolbox's `ModelRegistry` interface),
- the **drift detector** is a numpy PSI check (it implements `DriftDetector`; the toolbox's own backend is Evidently).

Each one plugs into the toolbox's own interface, which is the backend-agnostic design the toolbox is built around.

## Run it

You need Python 3.11+ and Node 18+.

```bash
# API
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt uvicorn pytest pytest-asyncio httpx
uvicorn playground.api:app --port 8001

# UI (another terminal)
cd web && npm install && npm run dev      # http://localhost:5174
```

Run the tests with `pytest`. 

## Layout

```
playground/world.py   the numpy model, in-memory registry, PSI drift detector, synthetic data
playground/api.py     one endpoint per feature, each calling the real library function
web/                  React + Vite UI
api/index.py          Vercel serverless entry point
```

The library is pinned to a commit in `requirements.txt`. Change it to move to a newer toolbox.

## Deploy

Deploys to Vercel as is: the UI builds from `web/`, the API runs as a Python function. `vercel.json` has the settings.
