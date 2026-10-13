use blindspot::{api, evaluation, store::Engine};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();
    let path = std::env::var("BLINDSPOT_DB_PATH").unwrap_or_else(|_| "blindspot.sqlite3".into());
    let mut engine = Engine::open(path)?;
    if std::env::args().any(|a| a == "--evaluate") {
        let result = evaluation::evaluate()?;
        engine.save_metrics(&result)?;
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }
    engine.initialize_demo_if_needed()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await?;
    tracing::info!("Blindspot synthetic API listening on http://127.0.0.1:3001");
    axum::serve(listener, api::router(engine))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
