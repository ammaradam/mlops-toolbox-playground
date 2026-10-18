"""The demo world: a tiny model, an in-memory registry and a light drift detector.

Everything that carries the toolbox's ideas is the real library (`mlops_toolbox`): contract
inference, validation, evaluation, gates, model cards, the typed model server. Only the
parts a demo can't ship are replaced, and each one plugs into the toolbox's own interface:

* the model is a small numpy logistic regression (the toolbox adapts any object with predict()),
* the registry keeps versions in memory (it implements the toolbox's `ModelRegistry` interface),
* the drift detector uses PSI in numpy (it implements `DriftDetector`; the real backend is Evidently).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

import mlops_toolbox as mt
from mlops_toolbox.core.models import ColumnDriftResult, DriftReport, ModelContract, ModelInfo
from mlops_toolbox.core.protocols import ModelAdapter
from mlops_toolbox.monitoring.base import DriftDetector
from mlops_toolbox.registry.base import ModelRegistry

MODEL_NAME = "loan-approval"
LABELS = ["approved", "declined"]
EMPLOYMENT = {"salaried": 0.60, "self-employed": 0.20, "student": 0.08, "retired": 0.12}
CREDIT = {"good": 0.55, "fair": 0.30, "poor": 0.15}
NUMERIC = ["age", "income", "loan_amount"]


# -- synthetic data ------------------------------------------------------------------------
def _shares(base: dict[str, float], pinned: str, share: float | None) -> list[float]:
    if share is None:
        return list(base.values())
    rest = {k: v for k, v in base.items() if k != pinned}
    scale = (1 - share) / sum(rest.values())
    return [share if k == pinned else v * scale for k, v in base.items()]


def make_data(n: int, seed: int, *, income_shift: float = 0.0, loan_scale: float = 1.0,
              student_share: float | None = None, poor_share: float | None = None) -> pd.DataFrame:
    """Loan applications. The knobs shift the population, which is how drift is produced."""
    rng = np.random.default_rng(seed)
    income = np.clip(rng.lognormal(10.8, 0.45, n) * (1 + income_shift), 8_000, 400_000)
    loan = np.clip(rng.lognormal(9.3, 0.6, n) * loan_scale, 1_500, 90_000)
    return pd.DataFrame({
        "age": np.clip(rng.normal(40, 11, n), 18, 75).round().astype(int),
        "income": income.round(0),
        "employment": rng.choice(list(EMPLOYMENT), n, p=_shares(EMPLOYMENT, "student", student_share)),
        "credit_history": rng.choice(list(CREDIT), n, p=_shares(CREDIT, "poor", poor_share)),
        "loan_amount": loan.round(0),
    })


def label(df: pd.DataFrame, seed: int) -> pd.Series:
    rng = np.random.default_rng(seed)
    credit = df["credit_history"].map({"good": 0.9, "fair": 0.0, "poor": -1.4})
    emp = df["employment"].map({"salaried": 0.4, "self-employed": 0.0, "student": -1.0, "retired": 0.1})
    z = (2.2 * (np.log(df["income"]) - 10.8) - 1.3 * (np.log(df["loan_amount"]) - 9.3)
         + credit + emp + 0.012 * (df["age"] - 40) + rng.normal(0, 0.5, len(df)))
    return pd.Series(np.where(z > 0, "approved", "declined"), name="decision")


# -- the model: logistic regression in numpy -----------------------------------------------
class LoanModel:
    """Trains on raw columns, like a pipeline would. Unknown categories encode as zeros and are
    silently accepted here, which is exactly what a contract exists to prevent."""

    def fit(self, X: pd.DataFrame, y: pd.Series, *, epochs: int, lr: float) -> LoanModel:
        self._mu = X[NUMERIC].mean()
        self._sd = X[NUMERIC].std().replace(0, 1)
        self._cats = {c: sorted(X[c].unique()) for c in ("employment", "credit_history")}
        A = self._encode(X)
        t = (y.to_numpy() == "approved").astype(float)
        w = np.zeros(A.shape[1])
        for _ in range(epochs):
            p = 1 / (1 + np.exp(-A @ w))
            w -= lr * (A.T @ (p - t)) / len(t)
        self._w = w
        return self

    def _encode(self, X: pd.DataFrame) -> np.ndarray:
        num = ((X[NUMERIC] - self._mu) / self._sd).to_numpy(float)
        cols = [(X[c].to_numpy() == v).astype(float)[:, None] for c, vs in self._cats.items() for v in vs]
        return np.hstack([np.ones((len(X), 1)), num, *cols])

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        p = 1 / (1 + np.exp(-self._encode(X) @ self._w))
        return np.column_stack([p, 1 - p])  # columns follow LABELS: approved, declined

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.array(LABELS)[np.argmax(self.predict_proba(X), axis=1)]


# -- in-memory registry (the toolbox's ModelRegistry interface) ----------------------------
@dataclass
class _Entry:
    info: ModelInfo
    model: ModelAdapter
    contract: ModelContract | None
    reference: pd.DataFrame | None
    reference_predictions: pd.DataFrame | None


@dataclass
class MemoryRegistry(ModelRegistry):
    entries: dict[str, list[_Entry]] = field(default_factory=dict)

    def _find(self, name: str, version: str) -> _Entry:
        versions = self.entries[name]
        if version == "latest":
            return versions[-1]
        for e in versions:
            if e.info.version == version or version in e.info.aliases:
                return e
        raise KeyError(f"{name} has no version or alias {version!r}")

    def register_model(self, model: ModelAdapter, name: str, run_id: str | None = None,
                       tags: dict[str, str] | None = None, contract: ModelContract | None = None,
                       reference_data: pd.DataFrame | None = None) -> ModelInfo:
        versions = self.entries.setdefault(name, [])
        number = str(len(versions) + 1)
        all_tags = dict(tags or {})
        ref_pred = None
        if reference_data is not None:
            all_tags["mlops_toolbox.has_reference"] = "true"
            ref_pred = pd.DataFrame({"prediction": model.predict(reference_data)})
        info = ModelInfo(name=name, version=number, backend="memory", source_run_id=run_id,
                         uri=f"memory://{name}/{number}", tags=all_tags)
        versions.append(_Entry(info, model, contract, reference_data, ref_pred))
        return info

    def get_model(self, name: str, version: str = "latest") -> ModelAdapter:
        return self._find(name, version).model

    def get_model_info(self, name: str, version: str = "latest") -> ModelInfo:
        return self._find(name, version).info

    def export_model(self, name: str, dst_dir: str | Path, version: str = "latest") -> Path:
        raise NotImplementedError("The demo registry keeps models in memory and cannot export them.")

    def get_contract(self, name: str, version: str = "latest") -> ModelContract | None:
        return self._find(name, version).contract

    def get_reference_data(self, name: str, version: str = "latest") -> pd.DataFrame | None:
        return self._find(name, version).reference

    def get_reference_predictions(self, name: str, version: str = "latest") -> pd.DataFrame | None:
        return self._find(name, version).reference_predictions

    def set_alias(self, name: str, version: str, alias: str) -> ModelInfo:
        for versions in self.entries.values():
            for e in versions:
                if alias in e.info.aliases:
                    e.info.aliases.remove(alias)
        info = self._find(name, version).info
        info.aliases.append(alias)
        return info

    def list_versions(self, name: str) -> list[ModelInfo]:
        return [e.info for e in self.entries[name]]


# -- a light drift detector (the toolbox's DriftDetector interface) ------------------------
PSI_THRESHOLD = 0.2


def _psi(ref: np.ndarray, cur: np.ndarray) -> float:
    eps = 1e-4
    r, c = np.clip(ref, eps, None), np.clip(cur, eps, None)
    return float(np.sum((c - r) * np.log(c / r)))


def share_vectors(ref: pd.Series, cur: pd.Series) -> tuple[list[str], np.ndarray, np.ndarray]:
    """Binned shares for a column: quantile bins from the reference for numbers, categories for text."""
    if pd.api.types.is_numeric_dtype(ref):
        edges = np.unique(np.quantile(ref, np.linspace(0, 1, 11)))
        edges[0], edges[-1] = -np.inf, np.inf
        r = np.histogram(ref, edges)[0] / len(ref)
        c = np.histogram(cur, edges)[0] / len(cur)
        labels = [f"q{i + 1}" for i in range(len(r))]
    else:
        labels = sorted(set(ref.astype(str)) | set(cur.astype(str)))
        r = np.array([(ref.astype(str) == v).mean() for v in labels])
        c = np.array([(cur.astype(str) == v).mean() for v in labels])
    return labels, r, c


class PsiDriftDetector(DriftDetector):
    def compare(self, reference: pd.DataFrame, current: pd.DataFrame,
                column_mapping: dict[str, str] | None = None) -> DriftReport:
        results: dict[str, ColumnDriftResult] = {}
        for col in reference.columns:
            if col not in current.columns:
                continue
            _, r, c = share_vectors(reference[col], current[col])
            psi = _psi(r, c)
            results[col] = ColumnDriftResult(column=col, drift_detected=psi >= PSI_THRESHOLD,
                                             drift_score=psi, stattest="psi")
        share = sum(r.drift_detected for r in results.values()) / max(1, len(results))
        return DriftReport(dataset_drift_detected=share >= 0.5, drift_share=share, column_results=results)


# -- the world -----------------------------------------------------------------------------
@dataclass
class World:
    registry: MemoryRegistry
    holdout: pd.DataFrame
    holdout_y: pd.Series
    steps: list[dict[str, Any]]


def _register(registry: MemoryRegistry, *, n_train: int, epochs: int, lr: float, seed: int,
              holdout: pd.DataFrame, holdout_y: pd.Series, steps: list[dict[str, Any]] | None = None) -> str:
    t0 = time.perf_counter()
    X = make_data(n_train, seed)
    y = label(X, seed + 1)
    model = mt.adapt(LoanModel().fit(X, y, epochs=epochs, lr=lr))
    t1 = time.perf_counter()
    report = mt.ClassificationEvaluator().evaluate(holdout_y, model.predict(holdout))
    t2 = time.perf_counter()
    contract = mt.infer_contract(X, y=y, evaluation=report)
    t3 = time.perf_counter()
    info = registry.register_model(model, name=MODEL_NAME, run_id=f"run-{seed}", contract=contract, reference_data=X)
    t4 = time.perf_counter()
    if steps is not None:
        cats = sum(1 for c in contract.input_columns if c.categories)
        steps += [
            {"id": "train", "title": "Train", "call": "your training code",
             "detail": f"Logistic model fitted on {n_train:,} rows.", "ms": round((t1 - t0) * 1000)},
            {"id": "evaluate", "title": "Evaluate", "call": "mt.ClassificationEvaluator().evaluate(...)",
             "detail": f"accuracy {report.metrics['accuracy']:.3f}, f1_macro {report.metrics['f1_macro']:.3f} on {report.n_samples} held-out rows.",
             "ms": round((t2 - t1) * 1000)},
            {"id": "contract", "title": "Infer the contract", "call": "mt.infer_contract(X_train, y=y_train, evaluation=report)",
             "detail": f"{len(contract.input_columns)} input columns, {cats} with closed category sets, plus output labels and the report.",
             "ms": round((t3 - t2) * 1000)},
            {"id": "register", "title": "Register with the contract", "call": "registry.register_model(model, ..., contract=..., reference_data=X_train)",
             "detail": f"Version {info.version} stored with its contract, {n_train:,} reference rows and baseline predictions.",
             "ms": round((t4 - t3) * 1000)},
        ]
    return info.version


def build_world(*, narrate: bool = False) -> World:
    holdout = make_data(400, seed=900)
    holdout_y = label(holdout, 901)
    registry = MemoryRegistry()
    steps: list[dict[str, Any]] = []
    v1 = _register(registry, n_train=1200, epochs=500, lr=0.3, seed=11, holdout=holdout, holdout_y=holdout_y,
                   steps=steps if narrate else None)
    registry.set_alias(MODEL_NAME, v1, "production")
    # A weaker candidate, so a quality gate has something to block.
    _register(registry, n_train=60, epochs=25, lr=0.05, seed=12, holdout=holdout, holdout_y=holdout_y)
    registry.set_alias(MODEL_NAME, "2", "candidate")
    if narrate:
        steps.append({"id": "alias", "title": "Point an alias at it", "call": 'registry.set_alias("loan-approval", "1", "production")',
                      "detail": "Version 1 is now `production`. A weaker version 2 is registered as `candidate`.", "ms": 0})
    return World(registry, holdout, holdout_y, steps)


@lru_cache(maxsize=1)
def get_world() -> World:
    return build_world()
