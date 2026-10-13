use axum::{body::Body, http::Request};
use blindspot::{api, fixtures, store::Engine, types::Transaction};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn event(id: &str, src: &str, dst: &str, second: i64, amount: i64) -> Transaction {
    Transaction {
        transaction_id: id.into(),
        timestamp: chrono::DateTime::from_timestamp(1791885600 + second, 0)
            .unwrap()
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        source_account_id: src.into(),
        destination_account_id: dst.into(),
        amount_minor: amount,
        currency: "INR".into(),
        channel: "synthetic_stream".into(),
        scenario_id: None,
    }
}
fn finish(e: &mut Engine) {
    while e.next_index < e.fixture.len() {
        e.next().unwrap();
    }
}
#[test]
fn causal_reset_twice_and_merchant_context() {
    let mut e = Engine::memory().unwrap();
    let mut prior = None;
    for _ in 0..2 {
        e.reset("mule_fan_in_pass_through").unwrap();
        for _ in 0..3 {
            e.next().unwrap();
            assert!(e.detection.cases.is_empty());
        }
        e.next().unwrap();
        let c = &e.detection.cases[0];
        assert_eq!(c.severity, "high");
        assert_eq!(c.transaction_ids.len(), 4);
        let serialized = serde_json::to_value(c).unwrap();
        if let Some(ref old) = prior {
            assert_eq!(old, &serialized);
        }
        prior = Some(serialized);
    }
    e.reset("merchant_legitimate").unwrap();
    finish(&mut e);
    let c = &e.detection.cases[0];
    assert_eq!(c.severity, "medium");
    assert_eq!(c.risk_score, 35);
    assert!(c
        .reason_codes
        .iter()
        .any(|r| r["code"] == "ESTABLISHED_SETTLEMENT"));
    for reason in &c.reason_codes {
        for id in reason["transaction_ids"].as_array().unwrap() {
            assert!(c
                .transaction_ids
                .contains(&id.as_str().unwrap().to_string()));
        }
    }
}
#[test]
fn duplicate_conflict_late_and_validation_are_atomic() {
    let mut e = Engine::memory().unwrap();
    let a = event("a", "A", "M", 10, 100);
    e.ingest_transaction(a.clone()).unwrap();
    assert!(e.ingest_transaction(a.clone()).unwrap().duplicate);
    let mut changed = a.clone();
    changed.amount_minor += 1;
    assert_eq!(e.ingest_transaction(changed).unwrap_err().status, 409);
    assert_eq!(
        e.ingest_transaction(event("late", "B", "M", 9, 100))
            .unwrap_err()
            .status,
        422
    );
    for bad in [
        event("zero", "A", "B", 11, 0),
        event("self", "A", "A", 11, 1),
        event("blank", " ", "B", 11, 1),
    ] {
        assert_eq!(e.ingest_transaction(bad).unwrap_err().status, 400);
    }
    assert_eq!(e.events.len(), 1);
}
#[test]
fn incomplete_and_single_source_do_not_trigger() {
    let mut e = Engine::memory().unwrap();
    for i in 0..3 {
        e.ingest_transaction(event(&format!("i{i}"), "A", "M", i, 100))
            .unwrap();
    }
    e.ingest_transaction(event("out", "M", "D", 3, 300))
        .unwrap();
    assert!(e.detection.cases.is_empty());
    for name in ["ordinary", "large_legitimate", "incomplete_fan_in"] {
        e.reset(name).unwrap();
        finish(&mut e);
        assert!(e.detection.cases.is_empty(), "{name}");
    }
    e.reset("insufficient_history").unwrap();
    finish(&mut e);
    assert_eq!(e.detection.cases[0].risk_score, 65);
    assert!(e.detection.cases[0]
        .reason_codes
        .iter()
        .any(|r| r["code"] == "INSUFFICIENT_HISTORY"));
}
#[test]
fn boundaries_and_preceding_outgoing() {
    for (end, expected) in [(600, true), (601, false)] {
        let mut e = Engine::memory().unwrap();
        for (id, s) in [("a", "A"), ("b", "B"), ("c", "C")] {
            e.ingest_transaction(event(id, s, "M", 0, 100)).unwrap();
        }
        e.ingest_transaction(event("out", "M", "D", end, 300))
            .unwrap();
        assert_eq!(!e.detection.cases.is_empty(), expected);
    }
    let mut e = Engine::memory().unwrap();
    e.ingest_transaction(event("before", "M", "D", 0, 300))
        .unwrap();
    for (id, s) in [("a", "A"), ("b", "B"), ("c", "C")] {
        e.ingest_transaction(event(id, s, "M", 0, 100)).unwrap();
    }
    e.ingest_transaction(event("tiny", "M", "D", 1, 1)).unwrap();
    assert!(e.detection.cases.is_empty());
}
#[test]
fn cumulative_outflow_grouping_and_multiedges() {
    let mut e = Engine::memory().unwrap();
    for (id, s) in [("a", "A"), ("b", "B"), ("c", "C")] {
        e.ingest_transaction(event(id, s, "M", 0, 100)).unwrap();
    }
    e.ingest_transaction(event("o1", "M", "D", 1, 120)).unwrap();
    assert!(e.detection.cases.is_empty());
    e.ingest_transaction(event("o2", "M", "D", 2, 120)).unwrap();
    e.ingest_transaction(event("o3", "M", "D", 3, 60)).unwrap();
    assert_eq!(e.detection.cases.len(), 1);
    let graph = e.graph("case-000001").unwrap();
    assert_eq!(graph["edges"].as_array().unwrap().len(), 6);
    assert_eq!(
        e.detection.cases[0].created_at,
        event("", "", "", 2, 1).timestamp
    );
}
#[test]
fn i64_max_aggregate_does_not_overflow() {
    let mut e = Engine::memory().unwrap();
    for (id, s) in [("a", "A"), ("b", "B"), ("c", "C")] {
        e.ingest_transaction(event(id, s, "M", 0, i64::MAX))
            .unwrap();
    }
    for i in 1..=3 {
        e.ingest_transaction(event(&format!("out{i}"), "M", "D", i, i64::MAX))
            .unwrap();
    }
    assert_eq!(e.detection.cases.len(), 1);
}
#[test]
fn restart_preserves_cases_cursor_and_equal_time_sequence() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("state.sqlite3");
    let expected;
    let cursor;
    {
        let mut e = Engine::open(&path).unwrap();
        e.reset("mule_staggered").unwrap();
        finish(&mut e);
        expected = serde_json::to_value(&e.detection.cases).unwrap();
        cursor = e.next_index;
    }
    let e = Engine::open(&path).unwrap();
    assert_eq!(serde_json::to_value(&e.detection.cases).unwrap(), expected);
    assert_eq!(e.next_index, cursor);
}
#[test]
fn db_failure_does_not_publish_scratch_state() {
    let mut e = Engine::memory().unwrap();
    e.db.execute_batch("CREATE TRIGGER fail_insert BEFORE INSERT ON transactions BEGIN SELECT RAISE(FAIL,'test failure'); END;").unwrap();
    assert_eq!(
        e.ingest_transaction(event("a", "A", "B", 0, 1))
            .unwrap_err()
            .status,
        500
    );
    assert!(e.events.is_empty());
    assert_eq!(e.detection.last_time, None);
    assert!(e.detection.cases.is_empty());
}
#[test]
fn provenance_does_not_change_detection() {
    let (history, events) = fixtures::load_demo("mule_fan_in_pass_through").unwrap();
    let mut a = Engine::memory().unwrap();
    let mut b = Engine::memory().unwrap();
    for e in history.into_iter().chain(events) {
        a.ingest_transaction(e.clone()).unwrap();
        let mut altered = e;
        altered.scenario_id = Some("benign arbitrary label".into());
        b.ingest_transaction(altered).unwrap();
    }
    assert_eq!(
        serde_json::to_value(a.detection.cases).unwrap(),
        serde_json::to_value(b.detection.cases).unwrap()
    );
}
async fn request(app: axum::Router, method: &str, path: &str, value: Value) -> (u16, Value) {
    let response = app
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(value.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status().as_u16();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}
#[tokio::test]
async fn http_contract_status_and_envelopes() {
    let app = api::router(Engine::memory().unwrap());
    let (status, health) = request(app.clone(), "GET", "/api/health", json!(null)).await;
    assert_eq!(status, 200);
    assert_eq!(health["source_mode"], "synthetic");
    assert_eq!(
        request(app.clone(), "GET", "/api/metrics", json!(null))
            .await
            .1["available"],
        false
    );
    assert_eq!(
        request(app.clone(), "GET", "/api/cases/missing", json!(null))
            .await
            .0,
        404
    );
    assert_eq!(
        request(app.clone(), "GET", "/api/transactions?limit=0", json!(null))
            .await
            .0,
        400
    );
    let tx = serde_json::to_value(event("a", "A", "B", 10, 100)).unwrap();
    assert_eq!(
        request(app.clone(), "POST", "/api/transactions", tx.clone())
            .await
            .0,
        200
    );
    assert_eq!(
        request(app.clone(), "POST", "/api/transactions", tx.clone())
            .await
            .1["duplicate"],
        true
    );
    let mut conflicting = tx.clone();
    conflicting["amount_minor"] = 101.into();
    assert_eq!(
        request(app.clone(), "POST", "/api/transactions", conflicting)
            .await
            .0,
        409
    );
    let mut invalid = tx;
    invalid["amount_minor"] = json!(1.5);
    let (status, error) = request(app, "POST", "/api/transactions", invalid).await;
    assert_eq!(status, 400);
    assert_eq!(error["error"]["code"], "INVALID_JSON");
}

#[test]
fn inflow_window_boundary_and_insufficient_ratio() {
    for (end, expected) in [(900, true), (901, false)] {
        let mut e = Engine::memory().unwrap();
        e.ingest_transaction(event("a", "A", "M", 0, 100)).unwrap();
        e.ingest_transaction(event("b", "B", "M", 300, 100))
            .unwrap();
        e.ingest_transaction(event("c", "C", "M", 300, 100))
            .unwrap();
        e.ingest_transaction(event("out", "M", "D", end, 200))
            .unwrap();
        assert_eq!(!e.detection.cases.is_empty(), expected);
    }
    let mut e = Engine::memory().unwrap();
    for (id, s) in [("a", "A"), ("b", "B"), ("c", "C")] {
        e.ingest_transaction(event(id, s, "M", 0, 100)).unwrap();
    }
    e.ingest_transaction(event("out", "M", "D", 1, 239))
        .unwrap();
    assert!(e.detection.cases.is_empty());
}

#[test]
fn failed_case_write_rolls_back_transaction_and_cursor() {
    let mut e = Engine::memory().unwrap();
    e.reset("mule_fan_in_pass_through").unwrap();
    for _ in 0..3 {
        e.next().unwrap();
    }
    let count = e.events.len();
    e.db.execute_batch("CREATE TRIGGER fail_case BEFORE INSERT ON cases BEGIN SELECT RAISE(FAIL,'test case failure'); END;").unwrap();
    assert!(e.next().is_err());
    assert_eq!(e.next_index, 3);
    assert_eq!(e.events.len(), count);
    assert!(e.detection.cases.is_empty());
    let persisted: usize =
        e.db.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))
            .unwrap();
    assert_eq!(persisted, count);
    e.db.execute_batch("DROP TRIGGER fail_case;").unwrap();
    e.next().unwrap();
    assert_eq!(e.detection.cases.len(), 1);
}

#[test]
fn metrics_are_measured_isolated_and_survive_reset() {
    let mut live = Engine::memory().unwrap();
    live.reset("mule_fan_in_pass_through").unwrap();
    live.next().unwrap();
    let events = live.events.clone();
    let status = live.status();
    let report = blindspot::evaluation::evaluate().unwrap();
    assert_eq!(report["scenario_count"], 24);
    for method in ["baseline", "blindspot"] {
        let m = &report[method];
        assert_eq!(
            ["tp", "fp", "fn", "tn"]
                .iter()
                .map(|key| m[key].as_u64().unwrap())
                .sum::<u64>(),
            24
        );
        assert_eq!(m["sampled_event_count"], 358);
        assert!(m["latency_p95_ms"].as_f64().unwrap() >= m["latency_p50_ms"].as_f64().unwrap());
    }
    assert_eq!(live.events, events);
    assert_eq!(live.status(), status);
    live.save_metrics(&report).unwrap();
    live.reset("ordinary").unwrap();
    assert_eq!(live.metrics().unwrap(), report);
}

#[test]
fn empty_selected_demo_survives_restart_and_submillisecond_order_is_strict() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty.sqlite3");
    {
        let mut e = Engine::open(&path).unwrap();
        e.reset("insufficient_history").unwrap();
        assert!(e.events.is_empty());
    }
    let mut e = Engine::open(&path).unwrap();
    e.initialize_demo_if_needed().unwrap();
    assert_eq!(e.scenario, "insufficient_history");
    let mut first = event("first", "A", "B", 0, 1);
    first.timestamp = "2026-10-13T10:00:00.0009Z".into();
    e.ingest_transaction(first).unwrap();
    let mut late = event("late", "A", "B", 0, 1);
    late.timestamp = "2026-10-13T10:00:00.0001Z".into();
    assert_eq!(e.ingest_transaction(late).unwrap_err().status, 422);
}

#[tokio::test]
async fn http_demo_twice_and_complete_are_deterministic() {
    let app = api::router(Engine::memory().unwrap());
    let mut expected = None;
    for _ in 0..2 {
        assert_eq!(
            request(
                app.clone(),
                "POST",
                "/api/demo/reset",
                json!({"scenario":"mule_fan_in_pass_through"})
            )
            .await
            .0,
            200
        );
        for i in 0..4 {
            let (status, step) = request(app.clone(), "POST", "/api/demo/next", json!({})).await;
            assert_eq!(status, 200);
            assert_eq!(step["next_index"], i + 1);
            let cases = request(app.clone(), "GET", "/api/cases", json!(null))
                .await
                .1;
            assert_eq!(cases["count"], if i < 3 { 0 } else { 1 });
        }
        let graph = request(
            app.clone(),
            "GET",
            "/api/cases/case-000001/graph",
            json!(null),
        )
        .await
        .1;
        if let Some(ref first) = expected {
            assert_eq!(first, &graph);
        }
        expected = Some(graph);
        let finished = request(app.clone(), "POST", "/api/demo/next", json!({}))
            .await
            .1;
        assert_eq!(finished["complete"], true);
        assert_eq!(finished["ingestion"], Value::Null);
    }
}
