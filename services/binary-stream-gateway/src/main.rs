use std::{
    collections::{BTreeSet, HashMap},
    env, fs,
    io::{BufRead, BufReader, Write},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path as AxumPath, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{broadcast, RwLock};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tree_sitter::{Language, Node, Parser};
use tracing::{error, info, warn};

#[derive(Clone)]
struct AppState {
    sessions: Arc<RwLock<HashMap<String, SessionState>>>,
    storage_root: Arc<PathBuf>,
}

#[derive(Clone)]
struct SessionState {
    build_id: String,
    resume_token: Option<String>,
    sender: broadcast::Sender<Value>,
    last_event_id: Option<String>,
    ast_store: Arc<RwLock<GatewayAstStore>>,
    live_reliability: Arc<RwLock<Option<Value>>>,
    runtime_state: Arc<RwLock<Option<Value>>>,
}

#[derive(Debug, Deserialize)]
struct CreateSessionRequest {
    stream_session_id: String,
    build_id: String,
    resume_token: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionResponse {
    stream_session_id: String,
    build_id: String,
    ws_path: String,
    resume_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AppendEventRequest {
    event: Value,
}

#[derive(Debug, Serialize)]
struct SessionInfoResponse {
    stream_session_id: String,
    build_id: String,
    resume_token: Option<String>,
    last_event_id: Option<String>,
    replayable_events: usize,
    ast_coverage: Option<u32>,
    ast_module_count: usize,
    live_reliability_score: Option<u32>,
    runtime_state_present: bool,
}

#[derive(Debug, Deserialize)]
struct StreamQuery {
    #[serde(rename = "resumeToken")]
    resume_token: Option<String>,
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ControlRequest {
    action: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize)]
struct BranchSessionRequest {
    new_stream_session_id: String,
    new_build_id: String,
    resume_token: Option<String>,
    snapshot_id: Option<String>,
    source_build_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RewindSessionRequest {
    snapshot_id: String,
    build_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct GatewaySessionMutationResponse {
    stream_session_id: String,
    build_id: String,
    snapshot_id: Option<String>,
    ast_coverage: Option<u32>,
    ast_module_count: usize,
    live_reliability_score: Option<u32>,
    runtime_state_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySnapshotState {
    id: String,
    checkpoint_id: Option<String>,
    parent_snapshot_id: Option<String>,
    phase: Option<String>,
    label: Option<String>,
    saved_at: String,
    build_id: String,
    ast_store: GatewayAstStore,
    live_reliability: Option<Value>,
    runtime_state: Option<Value>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayLiveStateStore {
    live_reliability: Option<Value>,
    runtime_state: Option<Value>,
    updated_at: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstStore {
    modules: HashMap<String, GatewayAstModuleState>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstModuleState {
    path: String,
    language: Option<String>,
    node_count: u32,
    exported_symbols: Vec<String>,
    callable_functions: Vec<String>,
    completed: bool,
    updated_at: String,
    semantic_nodes: Vec<GatewayAstNodeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstNodeSummary {
    id: String,
    kind: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    callable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completeness: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstModuleSummary {
    path: String,
    language: Option<String>,
    node_count: u32,
    exported_symbols: Vec<String>,
    callable_functions: Vec<String>,
    completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstStatePayload {
    coverage: u32,
    module_count: u32,
    modules: Vec<GatewayAstModuleSummary>,
    nodes: Vec<GatewayAstNodeSummary>,
    updated_at: String,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayAstDeltaPayload {
    change_id: String,
    coverage: u32,
    source: String,
    nodes: Vec<GatewayAstNodeSummary>,
    modules_touched: Vec<String>,
    updated_at: String,
}

#[tokio::main]
async fn main() {
    init_tracing();

    let storage_root = env::var("BINARY_STREAM_GATEWAY_STORAGE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("artifacts/binary-builds"));
    let port = env::var("BINARY_STREAM_GATEWAY_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(4010);

    let app_state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        storage_root: Arc::new(storage_root),
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/sessions", post(create_session))
        .route("/sessions/:session_id", get(get_session))
        .route("/sessions/:session_id/events", post(append_event))
        .route("/sessions/:session_id/control", post(post_control))
        .route("/sessions/:session_id/branch", post(branch_session))
        .route("/sessions/:session_id/rewind", post(rewind_session))
        .route("/ws/:session_id", get(websocket_stream))
        .with_state(app_state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("binary stream gateway listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind binary stream gateway");
    axum::serve(listener, app)
        .await
        .expect("binary stream gateway server failed");
}

async fn healthz() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "service": "binary-stream-gateway",
    }))
}

async fn create_session(
    State(state): State<AppState>,
    Json(request): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, (StatusCode, String)> {
    let sender = broadcast::channel(256).0;
    let stream_session_id = request.stream_session_id.clone();
    let build_id = request.build_id.clone();
    let ws_path = format!("/ws/{}", stream_session_id);

    {
        let mut sessions = state.sessions.write().await;
        let existing = sessions.get(&stream_session_id).cloned();
        let session = existing.unwrap_or(SessionState {
            build_id: build_id.clone(),
            resume_token: request.resume_token.clone(),
            sender,
            last_event_id: None,
            ast_store: Arc::new(RwLock::new(load_session_ast_store(
                state.storage_root.as_path(),
                &build_id,
            ))),
            live_reliability: Arc::new(RwLock::new(
                load_session_live_state(state.storage_root.as_path(), &build_id).live_reliability,
            )),
            runtime_state: Arc::new(RwLock::new(
                load_session_live_state(state.storage_root.as_path(), &build_id).runtime_state,
            )),
        });
        sessions.insert(stream_session_id.clone(), session);
    }

    ensure_session_dir(state.storage_root.as_path(), &build_id)?;

    Ok(Json(CreateSessionResponse {
        stream_session_id,
        build_id,
        ws_path,
        resume_token: request.resume_token,
    }))
}

async fn get_session(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
) -> Result<Json<SessionInfoResponse>, (StatusCode, String)> {
    let sessions = state.sessions.read().await;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?;

    let replay = load_session_events(state.storage_root.as_path(), &session.build_id, None)?;
    let ast_store = session.ast_store.read().await.clone();
    let ast_state = build_gateway_ast_state(&ast_store);
    let live_reliability = session.live_reliability.read().await.clone();
    let runtime_state = session.runtime_state.read().await.clone();
    Ok(Json(SessionInfoResponse {
        stream_session_id: session_id,
        build_id: session.build_id.clone(),
        resume_token: session.resume_token.clone(),
        last_event_id: session.last_event_id.clone(),
        replayable_events: replay.len(),
        ast_coverage: ast_state.as_ref().map(|state| state.coverage),
        ast_module_count: ast_state
            .as_ref()
            .map(|state| state.module_count as usize)
            .unwrap_or(0),
        live_reliability_score: extract_live_reliability_score(live_reliability.as_ref()),
        runtime_state_present: runtime_state.is_some(),
    }))
}

async fn append_event(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    Json(request): Json<AppendEventRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let session = {
        let mut sessions = state.sessions.write().await;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?;

        let event_id = request
            .event
            .get("id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(generate_id);
        session.last_event_id = Some(event_id);
        session.clone()
    };

    append_session_event(state.storage_root.as_path(), &session.build_id, &request.event)?;
    let _ = session.sender.send(request.event.clone());

    let derived_events = {
        let mut ast_store = session.ast_store.write().await;
        let mut live_reliability = session.live_reliability.write().await;
        let mut runtime_state = session.runtime_state.write().await;
        let derived_events = apply_gateway_ast_event(&session.build_id, &mut ast_store, &request.event);
        let live_state_changed =
            update_gateway_live_state(&mut live_reliability, &mut runtime_state, &request.event);
        let maybe_snapshot = maybe_build_gateway_snapshot(
            &session.build_id,
            &ast_store,
            live_reliability.clone(),
            runtime_state.clone(),
            &request.event,
        );
        if !derived_events.is_empty() || maybe_snapshot.is_some() || live_state_changed {
            persist_session_ast_store(state.storage_root.as_path(), &session.build_id, &ast_store)?;
            persist_session_live_state(
                state.storage_root.as_path(),
                &session.build_id,
                &GatewayLiveStateStore {
                    live_reliability: live_reliability.clone(),
                    runtime_state: runtime_state.clone(),
                    updated_at: Some(now_iso()),
                },
            )?;
        }
        if let Some(snapshot) = maybe_snapshot {
            persist_gateway_snapshot(state.storage_root.as_path(), &snapshot)?;
        }
        derived_events
    };

    for derived_event in derived_events {
        if let Some(event_id) = derived_event.get("id").and_then(Value::as_str) {
            let mut sessions = state.sessions.write().await;
            if let Some(entry) = sessions.get_mut(&session_id) {
                entry.last_event_id = Some(event_id.to_string());
            }
        }
        append_session_event(state.storage_root.as_path(), &session.build_id, &derived_event)?;
        let _ = session.sender.send(derived_event);
    }

    Ok(StatusCode::ACCEPTED)
}

async fn post_control(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    Json(request): Json<ControlRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let build_id = {
        let sessions = state.sessions.read().await;
        sessions
            .get(&session_id)
            .map(|session| session.build_id.clone())
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?
    };

    let payload = serde_json::json!({
        "id": generate_id(),
        "buildId": build_id,
        "timestamp": now_iso(),
        "type": "control.requested",
        "data": {
            "action": request.action,
            "payload": request.payload,
        }
    });

    append_event(
        State(state),
        AxumPath(session_id),
        Json(AppendEventRequest {
            event: payload,
        }),
    )
    .await
}

async fn branch_session(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    Json(request): Json<BranchSessionRequest>,
) -> Result<Json<GatewaySessionMutationResponse>, (StatusCode, String)> {
    let source_build_id = {
        let sessions = state.sessions.read().await;
        sessions
            .get(&session_id)
            .map(|session| session.build_id.clone())
            .or(request.source_build_id.clone())
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?
    };

    let (ast_store, live_reliability, runtime_state) = if let Some(snapshot_id) = request.snapshot_id.as_deref() {
        load_gateway_snapshot(state.storage_root.as_path(), &source_build_id, snapshot_id)
            .map(|snapshot| {
                (
                    snapshot.ast_store,
                    snapshot.live_reliability,
                    snapshot.runtime_state,
                )
            })
            .unwrap_or_else(|| {
                let live_state = load_session_live_state(state.storage_root.as_path(), &source_build_id);
                (
                    load_session_ast_store(state.storage_root.as_path(), &source_build_id),
                    live_state.live_reliability,
                    live_state.runtime_state,
                )
            })
    } else {
        let live_state = load_session_live_state(state.storage_root.as_path(), &source_build_id);
        (
            load_session_ast_store(state.storage_root.as_path(), &source_build_id),
            live_state.live_reliability,
            live_state.runtime_state,
        )
    };

    ensure_session_dir(state.storage_root.as_path(), &request.new_build_id)?;
    persist_session_ast_store(state.storage_root.as_path(), &request.new_build_id, &ast_store)?;
    persist_session_live_state(
        state.storage_root.as_path(),
        &request.new_build_id,
        &GatewayLiveStateStore {
            live_reliability: live_reliability.clone(),
            runtime_state: runtime_state.clone(),
            updated_at: Some(now_iso()),
        },
    )?;

    let sender = broadcast::channel(256).0;
    let new_session = SessionState {
        build_id: request.new_build_id.clone(),
        resume_token: request.resume_token.clone(),
        sender,
        last_event_id: None,
        ast_store: Arc::new(RwLock::new(ast_store.clone())),
        live_reliability: Arc::new(RwLock::new(live_reliability.clone())),
        runtime_state: Arc::new(RwLock::new(runtime_state.clone())),
    };

    {
        let mut sessions = state.sessions.write().await;
        sessions.insert(request.new_stream_session_id.clone(), new_session.clone());
    }

    let bootstrap_events = build_bootstrap_events(
        &request.new_build_id,
        &ast_store,
        live_reliability.as_ref(),
        runtime_state.as_ref(),
    );
    let mut last_event_id = None;
    for event in bootstrap_events {
        append_session_event(state.storage_root.as_path(), &request.new_build_id, &event)?;
        let _ = new_session.sender.send(event.clone());
        if let Some(event_id) = event.get("id").and_then(Value::as_str) {
            last_event_id = Some(event_id.to_string());
        }
    }
    if let Some(event_id) = last_event_id {
        let mut sessions = state.sessions.write().await;
        if let Some(entry) = sessions.get_mut(&request.new_stream_session_id) {
            entry.last_event_id = Some(event_id);
        }
    }

    let ast_state = build_gateway_ast_state(&ast_store);
    Ok(Json(GatewaySessionMutationResponse {
        stream_session_id: request.new_stream_session_id,
        build_id: request.new_build_id,
        snapshot_id: request.snapshot_id,
        ast_coverage: ast_state.as_ref().map(|state| state.coverage),
        ast_module_count: ast_state
            .as_ref()
            .map(|state| state.module_count as usize)
            .unwrap_or(0),
        live_reliability_score: extract_live_reliability_score(live_reliability.as_ref()),
        runtime_state_present: runtime_state.is_some(),
    }))
}

async fn rewind_session(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    Json(request): Json<RewindSessionRequest>,
) -> Result<Json<GatewaySessionMutationResponse>, (StatusCode, String)> {
    let (build_id, ast_store_handle, live_reliability_handle, runtime_state_handle) = {
        let sessions = state.sessions.read().await;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?;
        (
            request.build_id.clone().unwrap_or_else(|| session.build_id.clone()),
            session.ast_store.clone(),
            session.live_reliability.clone(),
            session.runtime_state.clone(),
        )
    };

    let snapshot = load_gateway_snapshot(state.storage_root.as_path(), &build_id, &request.snapshot_id)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!(
                    "unknown gateway snapshot {} for build {}",
                    request.snapshot_id, build_id
                ),
            )
        })?;

    {
        let mut ast_store = ast_store_handle.write().await;
        *ast_store = snapshot.ast_store.clone();
        persist_session_ast_store(state.storage_root.as_path(), &build_id, &ast_store)?;
    }
    {
        let mut live_reliability = live_reliability_handle.write().await;
        *live_reliability = snapshot.live_reliability.clone();
    }
    {
        let mut runtime_state = runtime_state_handle.write().await;
        *runtime_state = snapshot.runtime_state.clone();
    }
    persist_session_live_state(
        state.storage_root.as_path(),
        &build_id,
        &GatewayLiveStateStore {
            live_reliability: snapshot.live_reliability.clone(),
            runtime_state: snapshot.runtime_state.clone(),
            updated_at: Some(now_iso()),
        },
    )?;

    let current_ast_store = ast_store_handle.read().await.clone();
    let current_live_reliability = live_reliability_handle.read().await.clone();
    let current_runtime_state = runtime_state_handle.read().await.clone();
    let bootstrap_events = build_bootstrap_events(
        &build_id,
        &current_ast_store,
        current_live_reliability.as_ref(),
        current_runtime_state.as_ref(),
    );
    let mut last_event_id = None;
    for event in bootstrap_events {
        append_session_event(state.storage_root.as_path(), &build_id, &event)?;
        let sessions = state.sessions.read().await;
        if let Some(session) = sessions.get(&session_id) {
            let _ = session.sender.send(event.clone());
        }
        drop(sessions);
        if let Some(event_id) = event.get("id").and_then(Value::as_str) {
            last_event_id = Some(event_id.to_string());
        }
    }
    if let Some(event_id) = last_event_id {
        let mut sessions = state.sessions.write().await;
        if let Some(entry) = sessions.get_mut(&session_id) {
            entry.last_event_id = Some(event_id);
        }
    }

    let ast_state = build_gateway_ast_state(&current_ast_store);
    Ok(Json(GatewaySessionMutationResponse {
        stream_session_id: session_id,
        build_id,
        snapshot_id: Some(request.snapshot_id),
        ast_coverage: ast_state.as_ref().map(|state| state.coverage),
        ast_module_count: ast_state
            .as_ref()
            .map(|state| state.module_count as usize)
            .unwrap_or(0),
        live_reliability_score: extract_live_reliability_score(current_live_reliability.as_ref()),
        runtime_state_present: current_runtime_state.is_some(),
    }))
}

async fn websocket_stream(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    Query(query): Query<StreamQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let session = {
        let sessions = state.sessions.read().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown session: {}", session_id)))?
    };

    if let Some(expected) = session.resume_token.clone() {
        if let Some(provided) = query.resume_token.clone() {
            if expected != provided {
                return Err((StatusCode::UNAUTHORIZED, "invalid resume token".to_string()));
            }
        }
    }

    let replay = load_session_events(
        state.storage_root.as_path(),
        &session.build_id,
        query.cursor.as_deref(),
    )?;
    let bootstrap_events = if replay.is_empty() {
        let ast_store = session.ast_store.read().await.clone();
        let live_reliability = session.live_reliability.read().await.clone();
        let runtime_state = session.runtime_state.read().await.clone();
        build_bootstrap_events(
            &session.build_id,
            &ast_store,
            live_reliability.as_ref(),
            runtime_state.as_ref(),
        )
    } else {
        Vec::new()
    };
    let receiver = session.sender.subscribe();

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, replay, bootstrap_events, receiver)))
}

async fn handle_socket(
    socket: WebSocket,
    replay: Vec<Value>,
    bootstrap_events: Vec<Value>,
    mut receiver: broadcast::Receiver<Value>,
) {
    let (mut sender, mut incoming) = socket.split();

    tokio::spawn(async move {
        while let Some(message) = incoming.next().await {
            match message {
                Ok(Message::Ping(payload)) => {
                    let _ = payload;
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(error) => {
                    warn!("websocket receive error: {}", error);
                    break;
                }
            }
        }
    });

    for envelope in replay {
        if send_envelope(&mut sender, envelope).await.is_err() {
            return;
        }
    }

    for event in bootstrap_events {
        if send_envelope(&mut sender, event).await.is_err() {
            return;
        }
    }

    loop {
        match receiver.recv().await {
            Ok(envelope) => {
                if send_envelope(&mut sender, envelope).await.is_err() {
                    return;
                }
            }
            Err(broadcast::error::RecvError::Lagged(skipped)) => {
                warn!("websocket client lagged by {} events", skipped);
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}

async fn send_envelope(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    event: Value,
) -> Result<(), ()> {
    let payload = match serde_json::to_string(&event) {
        Ok(value) => value,
        Err(error) => {
            error!("failed to serialize gateway envelope: {}", error);
            return Err(());
        }
    };

    sender.send(Message::Text(payload)).await.map_err(|error| {
        warn!("failed to send websocket envelope: {}", error);
    })
}

fn init_tracing() {
    let filter = env::var("RUST_LOG")
        .unwrap_or_else(|_| "binary_stream_gateway=info,tower_http=info".to_string());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}

fn ensure_session_dir(storage_root: &Path, build_id: &str) -> Result<(), (StatusCode, String)> {
    let path = storage_root.join(build_id);
    fs::create_dir_all(&path)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to create session dir: {}", error)))
}

fn session_events_path(storage_root: &Path, build_id: &str) -> PathBuf {
    storage_root.join(build_id).join("gateway-events.ndjson")
}

fn session_ast_state_path(storage_root: &Path, build_id: &str) -> PathBuf {
    storage_root.join(build_id).join("gateway-ast-state.json")
}

fn session_live_state_path(storage_root: &Path, build_id: &str) -> PathBuf {
    storage_root.join(build_id).join("gateway-live-state.json")
}

fn gateway_snapshots_dir(storage_root: &Path, build_id: &str) -> PathBuf {
    storage_root.join(build_id).join("gateway-snapshots")
}

fn gateway_snapshot_path(storage_root: &Path, build_id: &str, snapshot_id: &str) -> PathBuf {
    gateway_snapshots_dir(storage_root, build_id).join(format!("{}.json", snapshot_id))
}

fn append_session_event(
    storage_root: &Path,
    build_id: &str,
    event: &Value,
) -> Result<(), (StatusCode, String)> {
    ensure_session_dir(storage_root, build_id)?;
    let path = session_events_path(storage_root, build_id);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to open event log: {}", error)))?;
    let line = serde_json::to_string(event)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to encode event: {}", error)))?;
    file.write_all(format!("{}\n", line).as_bytes())
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to persist event: {}", error)))
}

fn load_session_events(
    storage_root: &Path,
    build_id: &str,
    after_id: Option<&str>,
) -> Result<Vec<Value>, (StatusCode, String)> {
    let path = session_events_path(storage_root, build_id);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(path)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to open event log: {}", error)))?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();

    for line in reader.lines() {
        let line = line
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to read event log: {}", error)))?;
        if line.trim().is_empty() {
            continue;
        }
        let event: Value = serde_json::from_str(&line)
            .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to parse event log: {}", error)))?;
        events.push(event);
    }

    if let Some(cursor) = after_id {
        if let Some(index) = events.iter().position(|event| {
            event
                .get("id")
                .and_then(Value::as_str)
                .map(|value| value == cursor)
                .unwrap_or(false)
        }) {
            return Ok(events.into_iter().skip(index + 1).collect());
        }
    }

    Ok(events)
}

fn load_session_ast_store(storage_root: &Path, build_id: &str) -> GatewayAstStore {
    let path = session_ast_state_path(storage_root, build_id);
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return GatewayAstStore::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn persist_session_ast_store(
    storage_root: &Path,
    build_id: &str,
    ast_store: &GatewayAstStore,
) -> Result<(), (StatusCode, String)> {
    ensure_session_dir(storage_root, build_id)?;
    let path = session_ast_state_path(storage_root, build_id);
    let encoded = serde_json::to_string_pretty(ast_store).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to encode AST store: {}", error),
        )
    })?;
    fs::write(path, encoded).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to persist AST store: {}", error),
        )
    })
}

fn load_session_live_state(storage_root: &Path, build_id: &str) -> GatewayLiveStateStore {
    let path = session_live_state_path(storage_root, build_id);
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(_) => return GatewayLiveStateStore::default(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn persist_session_live_state(
    storage_root: &Path,
    build_id: &str,
    live_state: &GatewayLiveStateStore,
) -> Result<(), (StatusCode, String)> {
    ensure_session_dir(storage_root, build_id)?;
    let path = session_live_state_path(storage_root, build_id);
    let encoded = serde_json::to_string_pretty(live_state).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to encode live state: {}", error),
        )
    })?;
    fs::write(path, encoded).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to persist live state: {}", error),
        )
    })
}

fn persist_gateway_snapshot(
    storage_root: &Path,
    snapshot: &GatewaySnapshotState,
) -> Result<(), (StatusCode, String)> {
    ensure_session_dir(storage_root, &snapshot.build_id)?;
    fs::create_dir_all(gateway_snapshots_dir(storage_root, &snapshot.build_id)).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to create gateway snapshot dir: {}", error),
        )
    })?;
    let path = gateway_snapshot_path(storage_root, &snapshot.build_id, &snapshot.id);
    let encoded = serde_json::to_string_pretty(snapshot).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to encode gateway snapshot: {}", error),
        )
    })?;
    fs::write(path, encoded).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to persist gateway snapshot: {}", error),
        )
    })
}

fn load_gateway_snapshot(
    storage_root: &Path,
    build_id: &str,
    snapshot_id: &str,
) -> Option<GatewaySnapshotState> {
    let path = gateway_snapshot_path(storage_root, build_id, snapshot_id);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn maybe_build_gateway_snapshot(
    build_id: &str,
    ast_store: &GatewayAstStore,
    live_reliability: Option<Value>,
    runtime_state: Option<Value>,
    event: &Value,
) -> Option<GatewaySnapshotState> {
    let snapshot = event.get("data")?.get("snapshot")?;
    let snapshot_id = snapshot.get("id")?.as_str()?.trim();
    if snapshot_id.is_empty() {
        return None;
    }
    Some(GatewaySnapshotState {
        id: snapshot_id.to_string(),
        checkpoint_id: snapshot
            .get("checkpointId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        parent_snapshot_id: snapshot
            .get("parentSnapshotId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        phase: snapshot
            .get("phase")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        label: snapshot
            .get("label")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        saved_at: snapshot
            .get("savedAt")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(now_iso),
        build_id: build_id.to_string(),
        ast_store: ast_store.clone(),
        live_reliability,
        runtime_state,
    })
}

fn update_gateway_live_state(
    live_reliability: &mut Option<Value>,
    runtime_state: &mut Option<Value>,
    event: &Value,
) -> bool {
    let Some(event_type) = event.get("type").and_then(Value::as_str) else {
        return false;
    };

    match event_type {
        "reliability.stream" => {
            let next = event
                .get("data")
                .and_then(|data| data.get("reliability"))
                .cloned();
            if next.is_some() {
                *live_reliability = next;
                return true;
            }
        }
        "runtime.state" | "patch.applied" => {
            let next = event.get("data").and_then(|data| data.get("runtime")).cloned();
            if next.is_some() {
                *runtime_state = next;
                return true;
            }
        }
        _ => {}
    }

    false
}

fn apply_gateway_ast_event(
    build_id: &str,
    ast_store: &mut GatewayAstStore,
    event: &Value,
) -> Vec<Value> {
    let Some(event_type) = event.get("type").and_then(Value::as_str) else {
        return Vec::new();
    };

    let module_update = match event_type {
        "generation.delta" => parse_generation_delta_event(event),
        "token.delta" => parse_token_delta_event(event),
        _ => None,
    };

    let Some((path, content, language_hint)) = module_update else {
        return Vec::new();
    };

    let Some(module) = parse_gateway_module(&path, &content, language_hint.as_deref()) else {
        return Vec::new();
    };

    let updated_at = now_iso();
    ast_store.modules.insert(path.clone(), module.clone());
    ast_store.updated_at = Some(updated_at.clone());

    let Some(ast_state) = build_gateway_ast_state(ast_store) else {
        return Vec::new();
    };

    let delta = GatewayAstDeltaPayload {
        change_id: format!("astchg_{}", generate_id()),
        coverage: ast_state.coverage,
        source: "gateway".to_string(),
        nodes: build_module_nodes(&module).into_iter().take(512).collect(),
        modules_touched: vec![path.clone()],
        updated_at: updated_at.clone(),
    };

    vec![
        serde_json::json!({
            "id": generate_id(),
            "buildId": build_id,
            "timestamp": updated_at,
            "type": "ast.delta",
            "data": {
                "delta": delta,
            }
        }),
        serde_json::json!({
            "id": generate_id(),
            "buildId": build_id,
            "timestamp": now_iso(),
            "type": "ast.state",
            "data": {
                "astState": ast_state,
            }
        }),
    ]
}

fn parse_generation_delta_event(event: &Value) -> Option<(String, String, Option<String>)> {
    let delta = event.get("data")?.get("delta")?;
    let path = delta.get("path")?.as_str()?.trim().to_string();
    let content = delta.get("content")?.as_str()?.to_string();
    let language = delta
        .get("language")
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Some((path, content, language))
}

fn parse_token_delta_event(event: &Value) -> Option<(String, String, Option<String>)> {
    let data = event.get("data")?;
    let path = data.get("path")?.as_str()?.trim().to_string();
    let content = data.get("text")?.as_str()?.to_string();
    let language = data
        .get("language")
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Some((path, content, language))
}

fn build_gateway_ast_state(ast_store: &GatewayAstStore) -> Option<GatewayAstStatePayload> {
    if ast_store.modules.is_empty() {
        return None;
    }

    let mut modules = ast_store.modules.values().cloned().collect::<Vec<_>>();
    modules.sort_by(|left, right| left.path.cmp(&right.path));

    let module_count = modules.len() as u32;
    let completed_count = modules.iter().filter(|module| module.completed).count() as u32;
    let coverage = if module_count == 0 {
        0
    } else {
        completed_count.saturating_mul(100) / module_count
    };

    let nodes = modules
        .iter()
        .flat_map(build_module_nodes)
        .take(5_000)
        .collect::<Vec<_>>();

    Some(GatewayAstStatePayload {
        coverage,
        module_count,
        modules: modules
            .iter()
            .map(|module| GatewayAstModuleSummary {
                path: module.path.clone(),
                language: module.language.clone(),
                node_count: module.node_count,
                exported_symbols: module.exported_symbols.clone(),
                callable_functions: module.callable_functions.clone(),
                completed: module.completed,
            })
            .collect(),
        nodes,
        updated_at: ast_store.updated_at.clone().unwrap_or_else(now_iso),
        source: "gateway".to_string(),
    })
}

fn build_ast_state_event(build_id: &str, ast_store: &GatewayAstStore) -> Option<Value> {
    let ast_state = build_gateway_ast_state(ast_store)?;
    Some(serde_json::json!({
        "id": generate_id(),
        "buildId": build_id,
        "timestamp": now_iso(),
        "type": "ast.state",
        "data": {
            "astState": ast_state,
        }
    }))
}

fn build_live_reliability_event(build_id: &str, live_reliability: &Value) -> Value {
    serde_json::json!({
        "id": generate_id(),
        "buildId": build_id,
        "timestamp": now_iso(),
        "type": "reliability.stream",
        "data": {
            "reliability": live_reliability,
        }
    })
}

fn build_runtime_state_event(build_id: &str, runtime_state: &Value) -> Value {
    serde_json::json!({
        "id": generate_id(),
        "buildId": build_id,
        "timestamp": now_iso(),
        "type": "runtime.state",
        "data": {
            "runtime": runtime_state,
        }
    })
}

fn build_bootstrap_events(
    build_id: &str,
    ast_store: &GatewayAstStore,
    live_reliability: Option<&Value>,
    runtime_state: Option<&Value>,
) -> Vec<Value> {
    let mut events = Vec::new();
    if let Some(event) = build_ast_state_event(build_id, ast_store) {
        events.push(event);
    }
    if let Some(reliability) = live_reliability {
        events.push(build_live_reliability_event(build_id, reliability));
    }
    if let Some(runtime) = runtime_state {
        events.push(build_runtime_state_event(build_id, runtime));
    }
    events
}

fn extract_live_reliability_score(live_reliability: Option<&Value>) -> Option<u32> {
    live_reliability
        .and_then(|value| value.get("score"))
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn build_module_nodes(module: &GatewayAstModuleState) -> Vec<GatewayAstNodeSummary> {
    let mut nodes = Vec::with_capacity(1 + module.semantic_nodes.len());
    let module_id = format!("module:{}", module.path);
    nodes.push(GatewayAstNodeSummary {
        id: module_id,
        kind: "module".to_string(),
        label: module.path.clone(),
        path: Some(module.path.clone()),
        parent_id: None,
        exported: None,
        callable: None,
        completeness: Some(if module.completed { 100 } else { 0 }),
    });
    nodes.extend(module.semantic_nodes.clone());
    nodes
}

fn parse_gateway_module(
    path: &str,
    content: &str,
    language_hint: Option<&str>,
) -> Option<GatewayAstModuleState> {
    let (language, normalized_language) = resolve_tree_sitter_language(path, language_hint)?;
    let mut parser = Parser::new();
    parser.set_language(&language).ok()?;
    let tree = parser.parse(content, None)?;
    let root = tree.root_node();

    let mut exported_symbols = BTreeSet::new();
    let mut callable_functions = BTreeSet::new();
    let mut semantic_nodes = Vec::new();
    let module_id = format!("module:{}", path);
    collect_semantic_nodes(
        root,
        content.as_bytes(),
        path,
        &module_id,
        false,
        &mut semantic_nodes,
        &mut exported_symbols,
        &mut callable_functions,
    );

    Some(GatewayAstModuleState {
        path: path.to_string(),
        language: Some(normalized_language.to_string()),
        node_count: count_named_nodes(root).min(50_000),
        exported_symbols: exported_symbols.into_iter().take(512).collect(),
        callable_functions: callable_functions.into_iter().take(512).collect(),
        completed: true,
        updated_at: now_iso(),
        semantic_nodes,
    })
}

fn resolve_tree_sitter_language(path: &str, language_hint: Option<&str>) -> Option<(Language, &'static str)> {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".ts") {
        return Some((tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(), "typescript"));
    }
    if lower.ends_with(".tsx") {
        return Some((tree_sitter_typescript::LANGUAGE_TSX.into(), "typescript"));
    }
    if lower.ends_with(".js")
        || lower.ends_with(".jsx")
        || lower.ends_with(".mjs")
        || lower.ends_with(".cjs")
    {
        return Some((tree_sitter_javascript::LANGUAGE.into(), "javascript"));
    }

    match language_hint.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "typescript" => Some((tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(), "typescript")),
        "javascript" => Some((tree_sitter_javascript::LANGUAGE.into(), "javascript")),
        _ => None,
    }
}

fn count_named_nodes(node: Node<'_>) -> u32 {
    if !node.is_named() {
        return 0;
    }
    let mut count = 1_u32;
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count = count.saturating_add(count_named_nodes(child));
    }
    count
}

fn collect_semantic_nodes(
    node: Node<'_>,
    source: &[u8],
    path: &str,
    module_id: &str,
    exported_context: bool,
    semantic_nodes: &mut Vec<GatewayAstNodeSummary>,
    exported_symbols: &mut BTreeSet<String>,
    callable_functions: &mut BTreeSet<String>,
) {
    if !node.is_named() {
        return;
    }

    let kind = node.kind();
    let next_exported = exported_context || kind.starts_with("export");

    if should_capture_node(kind) {
        if let Some(name) = extract_name_from_node(node, source) {
            let callable = is_callable_node(node, source);
            let exported = next_exported || is_export_like_node(kind);
            let node_id = format!(
                "{}:{}:{}:{}",
                path,
                kind,
                node.start_position().row + 1,
                node.start_position().column + 1
            );

            if exported {
                exported_symbols.insert(name.clone());
            }
            if callable {
                callable_functions.insert(name.clone());
            }

            if semantic_nodes.len() < 4_999 {
                semantic_nodes.push(GatewayAstNodeSummary {
                    id: node_id,
                    kind: normalize_kind(kind),
                    label: name,
                    path: Some(path.to_string()),
                    parent_id: Some(module_id.to_string()),
                    exported: Some(exported),
                    callable: Some(callable),
                    completeness: Some(100),
                });
            }
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_semantic_nodes(
            child,
            source,
            path,
            module_id,
            next_exported,
            semantic_nodes,
            exported_symbols,
            callable_functions,
        );
    }
}

fn should_capture_node(kind: &str) -> bool {
    matches!(
        kind,
        "function_declaration"
            | "generator_function_declaration"
            | "method_definition"
            | "class_declaration"
            | "interface_declaration"
            | "type_alias_declaration"
            | "enum_declaration"
            | "variable_declarator"
            | "export_specifier"
    )
}

fn is_callable_node(node: Node<'_>, source: &[u8]) -> bool {
    match node.kind() {
        "function_declaration" | "generator_function_declaration" | "method_definition" => true,
        "variable_declarator" => node
            .child_by_field_name("value")
            .map(|value| {
                matches!(
                    value.kind(),
                    "arrow_function" | "function" | "function_expression" | "generator_function"
                )
            })
            .unwrap_or(false),
        "export_specifier" => false,
        _ => extract_name_from_node(node, source).is_some(),
    }
}

fn is_export_like_node(kind: &str) -> bool {
    kind.starts_with("export")
}

fn extract_name_from_node(node: Node<'_>, source: &[u8]) -> Option<String> {
    if let Some(name_node) = node.child_by_field_name("name") {
        return node_text(name_node, source);
    }

    if node.kind() == "export_specifier" {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if let Some(name) = node_text(child, source) {
                return Some(name);
            }
        }
    }

    None
}

fn node_text(node: Node<'_>, source: &[u8]) -> Option<String> {
    node.utf8_text(source)
        .ok()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_kind(kind: &str) -> String {
    kind.replace("_declaration", "").replace('_', ".")
}

fn now_iso() -> String {
    let now = chrono_like_timestamp();
    now
}

fn generate_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("gw_evt_{millis:x}")
}

fn chrono_like_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = now.as_secs() as i64;
    let nanos = now.subsec_nanos();
    let datetime = time_from_unix(seconds);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        datetime.year,
        datetime.month,
        datetime.day,
        datetime.hour,
        datetime.minute,
        datetime.second,
        nanos / 1_000_000
    )
}

struct DateTimeParts {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

fn time_from_unix(timestamp: i64) -> DateTimeParts {
    const SECONDS_PER_DAY: i64 = 86_400;
    let days = timestamp.div_euclid(SECONDS_PER_DAY);
    let seconds_of_day = timestamp.rem_euclid(SECONDS_PER_DAY);

    let (year, month, day) = civil_from_days(days);
    let hour = (seconds_of_day / 3_600) as u32;
    let minute = ((seconds_of_day % 3_600) / 60) as u32;
    let second = (seconds_of_day % 60) as u32;

    DateTimeParts {
        year,
        month,
        day,
        hour,
        minute,
        second,
    }
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = (yoe + era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (mp + if mp < 10 { 3 } else { -9 }) as u32;
    year += if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_delta_updates_gateway_ast_store() {
        let mut ast_store = GatewayAstStore::default();
        let event = serde_json::json!({
            "id": "evt_1",
            "buildId": "bin_1",
            "timestamp": "2026-03-24T00:00:00.000Z",
            "type": "generation.delta",
            "data": {
                "delta": {
                    "path": "src/index.ts",
                    "language": "typescript",
                    "content": "export function health() { return { ok: true }; }\nconst local = () => 1;",
                    "completed": true,
                    "order": 1,
                    "operation": "upsert"
                }
            }
        });

        let derived = apply_gateway_ast_event("bin_1", &mut ast_store, &event);

        assert_eq!(derived.len(), 2);
        let module = ast_store.modules.get("src/index.ts").expect("module stored");
        assert!(module.exported_symbols.iter().any(|value| value == "health"));
        assert!(module.callable_functions.iter().any(|value| value == "health"));
        assert!(module.callable_functions.iter().any(|value| value == "local"));
    }

    #[test]
    fn unsupported_files_do_not_emit_gateway_ast_events() {
        let mut ast_store = GatewayAstStore::default();
        let event = serde_json::json!({
            "id": "evt_2",
            "buildId": "bin_1",
            "timestamp": "2026-03-24T00:00:00.000Z",
            "type": "generation.delta",
            "data": {
                "delta": {
                    "path": "README.md",
                    "language": "markdown",
                    "content": "# hello",
                    "completed": true,
                    "order": 1,
                    "operation": "upsert"
                }
            }
        });

        let derived = apply_gateway_ast_event("bin_1", &mut ast_store, &event);
        assert!(derived.is_empty());
        assert!(ast_store.modules.is_empty());
    }

    #[test]
    fn live_runtime_state_is_tracked_and_snapshotted() {
        let mut live_reliability = None;
        let mut runtime_state = None;

        let reliability_event = serde_json::json!({
            "id": "evt_rel",
            "buildId": "bin_1",
            "timestamp": "2026-03-24T00:00:00.000Z",
            "type": "reliability.stream",
            "data": {
                "reliability": {
                    "score": 88,
                    "trend": "steady",
                    "warnings": [],
                    "blockers": [],
                    "resolvedBlockers": [],
                    "updatedAt": "2026-03-24T00:00:00.000Z",
                    "source": "compat"
                }
            }
        });
        let runtime_event = serde_json::json!({
            "id": "evt_run",
            "buildId": "bin_1",
            "timestamp": "2026-03-24T00:00:01.000Z",
            "type": "runtime.state",
            "data": {
                "runtime": {
                    "runnable": true,
                    "engine": "quickjs",
                    "availableFunctions": [],
                    "patches": [],
                    "updatedAt": "2026-03-24T00:00:01.000Z"
                }
            }
        });

        assert!(update_gateway_live_state(
            &mut live_reliability,
            &mut runtime_state,
            &reliability_event
        ));
        assert!(update_gateway_live_state(
            &mut live_reliability,
            &mut runtime_state,
            &runtime_event
        ));

        let snapshot_event = serde_json::json!({
            "id": "evt_snap",
            "buildId": "bin_1",
            "timestamp": "2026-03-24T00:00:02.000Z",
            "type": "snapshot.saved",
            "data": {
                "snapshot": {
                    "id": "snap_1",
                    "checkpointId": "chk_1",
                    "parentSnapshotId": null,
                    "phase": "materializing",
                    "label": "checkpoint",
                    "savedAt": "2026-03-24T00:00:02.000Z",
                    "source": "compat"
                }
            }
        });

        let snapshot = maybe_build_gateway_snapshot(
            "bin_1",
            &GatewayAstStore::default(),
            live_reliability.clone(),
            runtime_state.clone(),
            &snapshot_event,
        )
        .expect("snapshot");

        assert_eq!(
            extract_live_reliability_score(snapshot.live_reliability.as_ref()),
            Some(88)
        );
        assert_eq!(
            snapshot
                .runtime_state
                .as_ref()
                .and_then(|value| value.get("engine"))
                .and_then(Value::as_str),
            Some("quickjs")
        );
    }
}
