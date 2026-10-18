"""HTTP API for the playground. Each endpoint calls the real mlops-toolbox function behind a feature."""
from __future__ import annotations

import io
import json
import math
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import mlops_toolbox as mt
from mlops_toolbox.cli import templates
from mlops_toolbox.core.exceptions import ValidationFailedError
from mlops_toolbox.evaluation.gates import parse_gate
from mlops_toolbox.factories import model_server

from .world import (MODEL_NAME, PSI_THRESHOLD, PsiDriftDetector, build_world, get_world, make_data,
                    share_vectors)

app = FastAPI(title="mlops-toolbox playground", docs_url="/api/docs", openapi_url="/api/openapi.json")

# The model server below is the toolbox's own FastAPI app, built from the production model's
# contract: the same one `mt serve` runs. Its /predict returns 422 for anything off-contract.
_w = get_world()
app.mount("/api/model", model_server().build_app(
    _w.registry.get_model(MODEL_NAME, "production"), contract=_w.registry.get_contract(MODEL_NAME, "production")))


def _model_view(version: str) -> dict[str, Any]:
    w = get_world()
    info = w.registry.get_model_info(MODEL_NAME, version)
    contract = w.registry.get_contract(MODEL_NAME, version)
    ref = w.registry.get_reference_data(MODEL_NAME, version)
    return {
        "name": info.name, "version": info.version, "aliases": info.aliases, "uri": info.uri,
        "contract": contract.model_dump(mode="json") if contract else None,
        "reference_rows": 0 if ref is None else len(ref),
        "has_baseline": info.tags.get("mlops_toolbox.has_reference") == "true",
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/model")
def model() -> dict[str, Any]:
    """The registered versions and the production contract (the form fields are built from it)."""
    return {"versions": [_model_view("1"), _model_view("2")], "labels": ["approved", "declined"]}


@app.post("/api/register")
def register() -> dict[str, Any]:
    """Run the registration pipeline for real (train, evaluate, infer contract, register)."""
    w = build_world(narrate=True)
    return {"steps": w.steps, "model": _model_view("1")}


class ScoreRequest(BaseModel):
    csv: str = Field(max_length=20_000)


@app.post("/api/score")
def score(req: ScoreRequest) -> dict[str, Any]:
    """`score_dataframe`: validate against the contract on the way in, append predictions on the way out."""
    w = get_world()
    try:
        df = pd.read_csv(io.StringIO(req.csv))
    except Exception as exc:  # noqa: BLE001 - surface any parse problem to the user
        return {"ok": False, "problems": [f"could not read the CSV: {exc}"], "rows": []}
    if len(df) > 200:
        raise HTTPException(422, "The demo scores at most 200 rows.")
    try:
        scored = mt.score_dataframe(df, registry=w.registry, name=MODEL_NAME, version="production")
    except ValidationFailedError as exc:
        problems = [p.strip() for p in str(exc).split("\n  - ")[1:]]
        # For contrast: what the bare model does with the same rows when nothing checks them.
        try:
            raw = w.registry.get_model(MODEL_NAME, "production").predict(df)
            unchecked: dict[str, Any] = {"predictions": [str(x) for x in raw[:12]]}
        except Exception as err:  # noqa: BLE001 - this is the point: it fails or guesses
            unchecked = {"error": f"{type(err).__name__}: {err}"[:200]}
        return {"ok": False, "problems": problems, "rows": [], "unchecked": unchecked}
    rows = json.loads(scored.head(12).to_json(orient="records"))
    return {"ok": True, "problems": [], "rows": rows, "columns": list(scored.columns), "n": len(scored)}


class DriftRequest(BaseModel):
    income_shift: float = Field(0.0, ge=-0.6, le=1.0)
    loan_scale: float = Field(1.0, ge=0.4, le=2.5)
    student_share: float | None = Field(None, ge=0.0, le=0.8)
    poor_share: float | None = Field(None, ge=0.0, le=0.8)


def _hist(ref: pd.Series, cur: pd.Series) -> dict[str, Any]:
    labels, r, c = share_vectors(ref, cur)
    return {"labels": labels, "ref": [round(float(x), 4) for x in r], "cur": [round(float(x), 4) for x in c],
            "kind": "numeric" if pd.api.types.is_numeric_dtype(ref) else "category"}


@app.post("/api/drift")
def drift(req: DriftRequest) -> dict[str, Any]:
    """Drift against baselines stored at registration. No training data is needed, only the registry."""
    w = get_world()
    reg = w.registry
    reference = reg.get_reference_data(MODEL_NAME, "production")
    baseline_pred = reg.get_reference_predictions(MODEL_NAME, "production")
    assert reference is not None and baseline_pred is not None
    current = make_data(600, seed=5, income_shift=req.income_shift, loan_scale=req.loan_scale,
                        student_share=req.student_share, poor_share=req.poor_share)
    detector = PsiDriftDetector()
    report = detector.compare(reference, current)

    model_ = reg.get_model(MODEL_NAME, "production")
    current_pred = pd.DataFrame({"prediction": model_.predict(current)})
    pred_report = detector.compare(baseline_pred, current_pred)
    pred = pred_report.column_results["prediction"]

    columns = []
    for name, res in report.column_results.items():
        columns.append({"name": name, "psi": round(res.drift_score, 3), "drift": res.drift_detected,
                        **_hist(reference[name], current[name])})
    return {
        "threshold": PSI_THRESHOLD, "n_current": len(current), "stattest": "psi",
        "dataset_drift": report.dataset_drift_detected, "drift_share": round(report.drift_share, 2),
        "columns": columns,
        "prediction": {"name": "prediction", "psi": round(pred.drift_score, 3), "drift": pred.drift_detected,
                       **_hist(baseline_pred["prediction"], current_pred["prediction"]),
                       "approval_ref": round(float((baseline_pred["prediction"] == "approved").mean()), 3),
                       "approval_cur": round(float((current_pred["prediction"] == "approved").mean()), 3)},
    }


class GateRequest(BaseModel):
    version: str = Field("1", pattern="^[12]$")
    expressions: list[str] = Field(min_length=1, max_length=6)


@app.post("/api/gate")
def gate(req: GateRequest) -> dict[str, Any]:
    """`check_gates`, with the same output `mt gate` prints. Exit codes: 0 pass, 1 fail, 2 bad usage."""
    w = get_world()
    info = w.registry.get_model_info(MODEL_NAME, req.version)
    contract = w.registry.get_contract(MODEL_NAME, req.version)
    assert contract is not None and contract.evaluation is not None
    source = f"model '{MODEL_NAME}' v{info.version} (run {info.source_run_id})"
    expressions = [e.strip() for e in req.expressions if e.strip()]
    if not expressions:
        return {"exit_code": 2, "lines": ["Error: give at least one gate, for example f1_macro>=0.85"], "passed": False, "checks": []}
    for e in expressions:
        try:
            parse_gate(e)
        except ValueError as exc:
            return {"exit_code": 2, "lines": [f"Error: Invalid value: {exc}"], "passed": False, "checks": []}
    result = contract.evaluation.check_gates(expressions)
    lines = [f"Gating {source}"]
    lines += [f"  [{'PASS' if c.passed else 'FAIL'}] {c.expression}: {c.message}" for c in result.checks]
    lines.append("All gates passed." if result.passed else "Gate check FAILED.")
    return {"exit_code": 0 if result.passed else 1, "passed": result.passed, "lines": lines,
            "checks": [c.model_dump() for c in result.checks], "metrics": contract.evaluation.metrics}


@app.get("/api/card")
def card(version: str = "1") -> dict[str, str]:
    """`generate_model_card`, rendered from what the registry already knows."""
    if version not in ("1", "2"):
        raise HTTPException(404, "Unknown version.")
    return {"markdown": mt.generate_model_card(get_world().registry, MODEL_NAME, version)}


@app.get("/api/ship")
def ship() -> dict[str, Any]:
    """The files `mt ship` writes next to the exported model, using the toolbox's own templates."""
    w = get_world()
    info = w.registry.get_model_info(MODEL_NAME, "production")
    contract = w.registry.get_contract(MODEL_NAME, "production")
    assert contract is not None
    files = [
        {"path": "contract.json", "content": contract.model_dump_json(indent=2), "note": "The contract, so the server needs no tracking store."},
        {"path": "serve.py", "content": templates.SERVE_PY, "note": "Builds the typed API from contract.json."},
        {"path": "requirements.txt", "content": templates.requirements_txt(), "note": "Dependencies, pinned to what is installed when you ship."},
        {"path": "Dockerfile", "content": templates.DOCKERFILE, "note": "Runs the folder as-is."},
        {"path": "README.md", "content": templates.readme_md(MODEL_NAME, info.version, True), "note": "How to run it."},
    ]
    return {"name": MODEL_NAME, "version": info.version, "files": files,
            "omitted": "model/ holds the exported model artifacts. The demo registry keeps models in memory, so it is not shown."}


def _finite(x: Any) -> Any:  # keeps JSON clean if a metric is ever NaN
    return None if isinstance(x, float) and not math.isfinite(x) else x
