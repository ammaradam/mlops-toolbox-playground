from fastapi.testclient import TestClient

from playground.api import app

client = TestClient(app)

VALID = {"age": 34, "income": 62000, "employment": "salaried", "credit_history": "good", "loan_amount": 12000}


def test_model_lists_two_versions_with_contracts():
    r = client.get("/api/model").json()
    prod = r["versions"][0]
    assert prod["aliases"] == ["production"] and prod["has_baseline"] and prod["reference_rows"] == 1200
    cols = {c["name"]: c for c in prod["contract"]["input_columns"]}
    assert cols["employment"]["categories"] == ["retired", "salaried", "self-employed", "student"]
    assert cols["income"]["min_value"] < cols["income"]["max_value"]


def test_register_runs_the_pipeline():
    r = client.post("/api/register").json()
    assert [s["id"] for s in r["steps"]] == ["train", "evaluate", "contract", "register", "alias"]
    assert "f1_macro" in r["steps"][1]["detail"]


def test_real_model_server_accepts_valid_and_rejects_off_contract():
    ok = client.post("/api/model/predict", json={"records": [VALID]})
    assert ok.status_code == 200 and ok.json()["predictions"][0] in ("approved", "declined")
    bad_category = client.post("/api/model/predict", json={"records": [{**VALID, "employment": "astronaut"}]})
    assert bad_category.status_code == 422
    wrong_type = client.post("/api/model/predict", json={"records": [{**VALID, "income": "lots"}]})
    assert wrong_type.status_code == 422
    missing = {k: v for k, v in VALID.items() if k != "age"}
    assert client.post("/api/model/predict", json={"records": [missing]}).status_code == 422
    assert client.get("/api/model/contract").json()["input_columns"][0]["name"] == "age"


def test_score_enforces_the_contract():
    clean = "age,income,employment,credit_history,loan_amount\n34,62000,salaried,good,12000\n29,41000,student,fair,5000\n"
    r = client.post("/api/score", json={"csv": clean}).json()
    assert r["ok"] and "prediction" in r["columns"] and len(r["rows"]) == 2
    bad = "age,income,employment,credit_history,loan_amount\n34,62000,astronaut,good,12000\n"
    r = client.post("/api/score", json={"csv": bad}).json()
    assert not r["ok"] and "unknown categories" in r["problems"][0]
    missing = "age,income,employment,credit_history\n34,62000,salaried,good\n"
    assert "missing column 'loan_amount'" in client.post("/api/score", json={"csv": missing}).json()["problems"][0]


def test_drift_is_quiet_without_shift_and_loud_with_it():
    calm = client.post("/api/drift", json={}).json()
    assert not calm["dataset_drift"] and not any(c["drift"] for c in calm["columns"])
    shifted = client.post("/api/drift", json={"income_shift": -0.3, "student_share": 0.4}).json()
    flagged = {c["name"] for c in shifted["columns"] if c["drift"]}
    assert {"income", "employment"} <= flagged
    assert shifted["prediction"]["approval_cur"] < shifted["prediction"]["approval_ref"]
    assert all(abs(sum(c["ref"]) - 1) < 1e-3 for c in shifted["columns"])


def test_gate_passes_for_production_and_blocks_the_candidate():
    ok = client.post("/api/gate", json={"version": "1", "expressions": ["f1_macro>=0.85"]}).json()
    assert ok["exit_code"] == 0 and ok["lines"][-1] == "All gates passed."
    blocked = client.post("/api/gate", json={"version": "2", "expressions": ["f1_macro>=0.85"]}).json()
    assert blocked["exit_code"] == 1 and blocked["lines"][-1] == "Gate check FAILED."
    typo = client.post("/api/gate", json={"version": "1", "expressions": ["f1_mcro>=0.85"]}).json()
    assert typo["exit_code"] == 1 and "not found" in typo["lines"][1]
    invalid = client.post("/api/gate", json={"version": "1", "expressions": ["f1 is good"]}).json()
    assert invalid["exit_code"] == 2


def test_card_and_ship_use_the_toolbox_templates():
    card = client.get("/api/card?version=1").json()["markdown"]
    assert card.startswith("# Model card: loan-approval") and "one of: `retired`" in card and "Drift baseline stored" in card
    files = {f["path"]: f["content"] for f in client.get("/api/ship").json()["files"]}
    assert set(files) == {"contract.json", "serve.py", "requirements.txt", "Dockerfile", "README.md"}
    assert '"input_columns"' in files["contract.json"] and "FROM python" in files["Dockerfile"]


def test_rejected_batch_shows_what_the_bare_model_would_do():
    bad = "age,income,employment,credit_history,loan_amount\n34,62000,astronaut,good,12000\n"
    r = client.post("/api/score", json={"csv": bad}).json()
    assert r["unchecked"]["predictions"][0] in ("approved", "declined")  # silently guesses
    crash = "age,income,employment,credit_history\n34,62000,salaried,good\n"
    assert "error" in client.post("/api/score", json={"csv": crash}).json()["unchecked"]


def test_a_recession_drifts_the_whole_dataset():
    r = client.post("/api/drift", json={"income_shift": -0.3, "poor_share": 0.4, "loan_scale": 1.4}).json()
    assert r["dataset_drift"] and r["drift_share"] >= 0.5
    assert r["prediction"]["drift"] and r["prediction"]["approval_cur"] < 0.3
