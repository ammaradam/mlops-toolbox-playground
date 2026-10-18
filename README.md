# MLOps Toolbox Playground

Register a model once, then watch its contract drive typed serving, batch scoring, drift checks, CI gates, model cards and shipping. It runs the real [mlops-toolbox](https://github.com/ammaradam/MLOps-Toolbox) library, so what you see is what the library does.

## What you can try

| Feature | What to do | Library code behind it |
|---|---|---|
| **Register** | Run the pipeline and watch the contract appear: schema, category sets, ranges, metrics, drift baseline | `ClassificationEvaluator`, `infer_contract`, `register_model` |
| **Typed serving** | Send a valid request, then a wrong type, an unknown category, a missing field | the toolbox's own `FastAPIModelServer`, the one `mt serve` runs |
| **Batch scoring** | Score a CSV; break it and see it rejected, next to what the bare model would have done | `score_dataframe`, `validate_against_contract` |
| **Drift** | Move incomes, loan sizes and the customer mix; watch each column and the predictions react | baseline reference data and predictions stored at registration |
| **CI gate** | Gate v1 and a weaker v2 candidate; try a typo; see the exit code and the pull-request check | `check_gates`, the output of `mt gate` |
| **Model card** | Read the card written from the registry, rendered or as Markdown | `generate_model_card` |
| **Ship** | Browse the files `mt ship` writes | the toolbox's own `mt ship` templates |

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

Run the tests with `pytest`. Link straight to a feature with `?tab=serve`, `score`, `drift`, `gate`, `card` or `ship`.

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
