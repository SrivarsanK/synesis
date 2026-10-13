use crate::{
    detection::Detection,
    fixtures,
    types::{ApiError, Case, IngestResult, Transaction},
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap},
    path::Path,
    time::Instant,
};

pub struct Engine {
    pub db: Connection,
    pub detection: Detection,
    pub events: Vec<Transaction>,
    ids: HashMap<String, usize>,
    pub scenario: String,
    pub next_index: usize,
    pub fixture: Vec<Transaction>,
}
impl Engine {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, ApiError> {
        Self::from_connection(Connection::open(path)?)
    }
    pub fn memory() -> Result<Self, ApiError> {
        Self::from_connection(Connection::open_in_memory()?)
    }
    pub fn initialize_demo_if_needed(&mut self) -> Result<(), ApiError> {
        let selected: bool =
            self.db
                .query_row("SELECT EXISTS(SELECT 1 FROM demo_state)", [], |r| r.get(0))?;
        if self.events.is_empty() && !selected {
            self.reset("mule_fan_in_pass_through")?;
        }
        Ok(())
    }
    fn from_connection(db: Connection) -> Result<Self, ApiError> {
        db.execute_batch("PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS transactions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT NOT NULL UNIQUE, event_timestamp TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cases (case_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS case_transactions (case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), PRIMARY KEY(case_id,transaction_id));
            CREATE TABLE IF NOT EXISTS evaluation_runs (run_id INTEGER PRIMARY KEY AUTOINCREMENT, dataset_name TEXT NOT NULL, evaluated_at TEXT NOT NULL, metrics_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS demo_state (id INTEGER PRIMARY KEY CHECK(id=1), scenario TEXT NOT NULL, next_index INTEGER NOT NULL);")?;
        let events: Vec<Transaction> = {
            let mut stmt = db.prepare("SELECT payload FROM transactions ORDER BY sequence")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            let mut result = vec![];
            for row in rows {
                result.push(serde_json::from_str(&row?)?);
            }
            result
        };
        let mut detection = Detection::default();
        let mut ids = HashMap::new();
        for (i, tx) in events.iter().enumerate() {
            detection.apply(tx, tx.validate()?)?;
            ids.insert(tx.transaction_id.clone(), i);
        }
        let state: Option<(String, usize)> = {
            let mut stmt = db.prepare("SELECT scenario,next_index FROM demo_state WHERE id=1")?;
            let mut rows = stmt.query([])?;
            if let Some(row) = rows.next()? {
                Some((row.get(0)?, row.get(1)?))
            } else {
                None
            }
        };
        let (scenario, next_index) = state.unwrap_or(("mule_fan_in_pass_through".into(), 0));
        let fixture = fixtures::load_demo(&scenario)?.1;
        let mut engine = Self {
            db,
            detection,
            events,
            ids,
            scenario,
            next_index,
            fixture,
        };
        engine.hydrate_cases();
        Ok(engine)
    }
    fn hydrate_cases(&mut self) {
        for case in &mut self.detection.cases {
            Self::hydrate(case, &self.events, &self.ids);
        }
    }
    fn hydrate(case: &mut Case, events: &[Transaction], ids: &HashMap<String, usize>) {
        case.transaction_ids
            .sort_by_key(|id| ids.get(id).copied().unwrap_or(usize::MAX));
        case.account_ids = case
            .transaction_ids
            .iter()
            .filter_map(|id| ids.get(id))
            .flat_map(|i| {
                [
                    events[*i].source_account_id.clone(),
                    events[*i].destination_account_id.clone(),
                ]
            })
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
    }
    pub fn ingest_transaction(&mut self, tx: Transaction) -> Result<IngestResult, ApiError> {
        self.ingest(tx, None)
    }
    fn ingest(&mut self, tx: Transaction, cursor: Option<usize>) -> Result<IngestResult, ApiError> {
        let timer = Instant::now();
        let now = tx.validate()?;
        if let Some(i) = self.ids.get(&tx.transaction_id) {
            if self.events[*i] != tx {
                return Err(ApiError {
                    status: 409,
                    code: "CONFLICTING_TRANSACTION_ID",
                    message: "ID already exists with different content".into(),
                });
            }
            return Ok(IngestResult {
                transaction_id: tx.transaction_id,
                accepted: true,
                duplicate: true,
                processing_latency_ms: timer.elapsed().as_secs_f64() * 1000.0,
                updated_account_ids: vec![],
                case_ids_updated: vec![],
            });
        }
        let precedes_last = self.events.last().is_some_and(|last| {
            chrono::DateTime::parse_from_rfc3339(&tx.timestamp).ok()
                < chrono::DateTime::parse_from_rfc3339(&last.timestamp).ok()
        });
        if precedes_last {
            return Err(ApiError {
                status: 422,
                code: "OUT_OF_ORDER_EVENT",
                message:
                    "Event precedes last accepted event; reset demo or submit chronological events"
                        .into(),
            });
        }
        // Recoverable scratch state: publish only after durable commit succeeds.
        let mut scratch = self.detection.clone();
        let changed = scratch.apply(&tx, now)?;
        for case in scratch
            .cases
            .iter_mut()
            .filter(|c| changed.contains(&c.case_id))
        {
            let mut accounts = BTreeSet::new();
            for id in &case.transaction_ids {
                let e = if id == &tx.transaction_id {
                    &tx
                } else {
                    &self.events[*self
                        .ids
                        .get(id)
                        .ok_or_else(|| ApiError::internal("missing evidence"))?]
                };
                accounts.insert(e.source_account_id.clone());
                accounts.insert(e.destination_account_id.clone());
            }
            case.account_ids = accounts.into_iter().collect();
            case.transaction_ids
                .sort_by_key(|id| self.ids.get(id).copied().unwrap_or(self.events.len()));
        }
        let sql = self.db.transaction()?;
        sql.execute("INSERT INTO transactions(transaction_id,event_timestamp,payload,received_at) VALUES (?1,?2,?3,?4)",params![tx.transaction_id,tx.timestamp,serde_json::to_string(&tx)?,chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true)])?;
        for case in scratch
            .cases
            .iter()
            .filter(|c| changed.contains(&c.case_id))
        {
            Self::persist_case(&sql, case)?;
        }
        if let Some(next) = cursor {
            sql.execute("INSERT INTO demo_state VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET scenario=excluded.scenario,next_index=excluded.next_index",params![self.scenario,next])?;
        }
        sql.commit()?;
        self.detection = scratch;
        self.ids
            .insert(tx.transaction_id.clone(), self.events.len());
        self.events.push(tx.clone());
        if let Some(next) = cursor {
            self.next_index = next;
        }
        let latency = timer.elapsed().as_secs_f64() * 1000.0;
        tracing::info!(transaction_id=%tx.transaction_id,processing_duration_ms=latency,"synthetic event accepted");
        Ok(IngestResult {
            transaction_id: tx.transaction_id,
            accepted: true,
            duplicate: false,
            processing_latency_ms: latency,
            updated_account_ids: vec![tx.source_account_id, tx.destination_account_id],
            case_ids_updated: changed,
        })
    }
    fn persist_case(db: &Connection, case: &Case) -> Result<(), ApiError> {
        db.execute("INSERT INTO cases VALUES(?1,?2) ON CONFLICT(case_id) DO UPDATE SET payload=excluded.payload",params![case.case_id,serde_json::to_string(case)?])?;
        for id in &case.transaction_ids {
            db.execute(
                "INSERT OR IGNORE INTO case_transactions VALUES(?1,?2)",
                params![case.case_id, id],
            )?;
        }
        Ok(())
    }
    pub fn reset(&mut self, scenario: &str) -> Result<Value, ApiError> {
        let (history, fixture) = fixtures::load_demo(scenario)?;
        let mut fresh = Self::memory()?;
        for event in history {
            fresh.ingest_transaction(event)?;
        }
        let sql = self.db.transaction()?;
        sql.execute_batch("DELETE FROM case_transactions; DELETE FROM cases; DELETE FROM transactions; DELETE FROM demo_state;")?;
        for tx in &fresh.events {
            sql.execute("INSERT INTO transactions(transaction_id,event_timestamp,payload,received_at) VALUES(?1,?2,?3,?4)",params![tx.transaction_id,tx.timestamp,serde_json::to_string(tx)?,chrono::Utc::now().to_rfc3339()])?;
        }
        for case in &fresh.detection.cases {
            Self::persist_case(&sql, case)?;
        }
        sql.execute("INSERT INTO demo_state VALUES(1,?1,0)", [scenario])?;
        sql.commit()?;
        self.events = fresh.events;
        self.ids = fresh.ids;
        self.detection = fresh.detection;
        self.scenario = scenario.into();
        self.fixture = fixture;
        self.next_index = 0;
        Ok(self.status())
    }
    pub fn next(&mut self) -> Result<Value, ApiError> {
        if self.next_index >= self.fixture.len() {
            return Ok(json!({"ingestion":null,"next_index":self.next_index,"complete":true}));
        }
        let event = self.fixture[self.next_index].clone();
        let result = self.ingest(event, Some(self.next_index + 1))?;
        // A fixture event may already have been ingested through the API. Advance
        // the replay cursor durably while preserving duplicate event semantics.
        if result.duplicate {
            self.db.execute("INSERT INTO demo_state VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET next_index=excluded.next_index",params![self.scenario,self.next_index+1])?;
            self.next_index += 1;
        }
        Ok(
            json!({"ingestion":result,"next_index":self.next_index,"complete":self.next_index==self.fixture.len()}),
        )
    }
    pub fn status(&self) -> Value {
        json!({"scenario":self.scenario,"source_mode":"synthetic","next_index":self.next_index,"total_events":self.fixture.len(),"complete":self.next_index==self.fixture.len(),"running":false})
    }
    pub fn case(&self, id: &str) -> Result<&Case, ApiError> {
        self.detection
            .cases
            .iter()
            .find(|c| c.case_id == id)
            .ok_or(ApiError {
                status: 404,
                code: "CASE_NOT_FOUND",
                message: "No case exists with that ID".into(),
            })
    }
    pub fn graph(&self, id: &str) -> Result<Value, ApiError> {
        let case = self.case(id)?;
        let edges: Vec<_> = case
            .transaction_ids
            .iter()
            .filter_map(|id| self.ids.get(id))
            .map(|i| &self.events[*i])
            .collect();
        let nodes:Vec<_>=case.account_ids.iter().map(|id|json!({"id":id,"label":format!("Account •{}",id.chars().rev().take(3).collect::<String>().chars().rev().collect::<String>()),"role":if id==&case.subject_account_id {"intermediary"} else if edges.iter().any(|e|&e.source_account_id==id && e.destination_account_id==case.subject_account_id) {"source"} else {"destination"},"risk_level":if id==&case.subject_account_id {case.severity.as_str()} else {"unknown"}})).collect();
        Ok(
            json!({"case_id":id,"nodes":nodes,"edges":edges.iter().map(|e|json!({"id":e.transaction_id,"source":e.source_account_id,"target":e.destination_account_id,"amount_minor":e.amount_minor,"currency":e.currency,"timestamp":e.timestamp})).collect::<Vec<_>>()}),
        )
    }
    pub fn metrics(&self) -> Result<Value, ApiError> {
        let mut stmt = self
            .db
            .prepare("SELECT metrics_json FROM evaluation_runs ORDER BY run_id DESC LIMIT 1")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            Ok(serde_json::from_str(&row.get::<_, String>(0)?)?)
        } else {
            Ok(json!({"available":false,"reason":"Not yet measured"}))
        }
    }
    pub fn save_metrics(&self, value: &Value) -> Result<(), ApiError> {
        self.db.execute(
            "INSERT INTO evaluation_runs(dataset_name,evaluated_at,metrics_json) VALUES(?1,?2,?3)",
            params![
                value["dataset"].as_str(),
                value["evaluated_at"].as_str(),
                serde_json::to_string(value)?
            ],
        )?;
        Ok(())
    }
}
