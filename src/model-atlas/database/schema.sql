-- SQLite snapshot schema for source evidence, public model rows, and matcher audit traces.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS model_atlas_schema_manifest (
	object_type TEXT NOT NULL,
	object_name TEXT NOT NULL,
	PRIMARY KEY (object_type, object_name)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
	id INTEGER PRIMARY KEY,
	completed_at_epoch_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS artificial_analysis_raw_models (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	model_id TEXT,
	name TEXT,
	short_name TEXT,
	creator_name TEXT,
	model_url TEXT,
	release_date TEXT,
	deprecated INTEGER,
	reasoning_model INTEGER,
	reasoning_effort TEXT,
	open_weights INTEGER,
	commercial_allowed INTEGER,
	input_modality_text INTEGER,
	input_modality_image INTEGER,
	input_modality_video INTEGER,
	input_modality_speech INTEGER,
	output_modality_text INTEGER,
	output_modality_image INTEGER,
	output_modality_video INTEGER,
	output_modality_speech INTEGER,
	median_output_tokens_per_second REAL,
	median_time_to_first_token_seconds REAL,
	median_end_to_end_response_time_seconds REAL,
	intelligence_index REAL,
	agentic_index REAL,
	coding_index REAL,
	omniscience_index REAL,
	omniscience_accuracy REAL,
	apex_agents REAL,
	critpt REAL,
	gdpval_normalized REAL,
	gpqa REAL,
	harvey_lab REAL,
	hle REAL,
	itbench_sre REAL,
	lcr REAL,
	mmmu_pro REAL,
	scicode REAL,
	tau_banking REAL,
	terminalbench_v21 REAL,
	input_cost REAL,
	reasoning_cost REAL,
	output_cost REAL,
	total_cost REAL,
	input_tokens REAL,
	reasoning_tokens REAL,
	answer_tokens REAL,
	output_tokens REAL,
	total_tokens REAL,
	cost_per_task REAL,
	seconds_per_task REAL,
	output_tokens_per_task REAL,
	logo_url TEXT,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS artificial_analysis_evaluations_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	benchmark_key TEXT NOT NULL,
	model_id TEXT NOT NULL,
	model TEXT NOT NULL,
	provider TEXT NOT NULL,
	provider_id TEXT,
	reasoning_effort TEXT,
	score REAL NOT NULL,
	task_run_count INTEGER NOT NULL,
	cost_per_task_usd REAL NOT NULL,
	seconds_per_task REAL NOT NULL,
	tokens_per_task REAL NOT NULL,
	input_tokens_per_task REAL NOT NULL,
	output_tokens_per_task REAL NOT NULL,
	answer_tokens_per_task REAL,
	reasoning_tokens_per_task REAL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS models_dev_raw_models (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	status_code INTEGER,
	url TEXT NOT NULL,
	provider_id TEXT NOT NULL,
	provider_name TEXT,
	provider_api TEXT,
	model_id TEXT NOT NULL,
	name TEXT,
	family TEXT,
	release_date TEXT,
	last_updated TEXT,
	open_weights INTEGER,
	reasoning INTEGER,
	tool_call INTEGER,
	cost_input REAL,
	cost_output REAL,
	cost_cache_read REAL,
	cost_cache_write REAL,
	cost_output_audio REAL,
	limit_context INTEGER,
	limit_output INTEGER,
	input_modality_text INTEGER,
	input_modality_image INTEGER,
	input_modality_audio INTEGER,
	input_modality_video INTEGER,
	input_modality_pdf INTEGER,
	output_modality_text INTEGER,
	output_modality_image INTEGER,
	output_modality_audio INTEGER,
	output_modality_video INTEGER,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS openrouter_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	row_kind TEXT NOT NULL,
	model_id TEXT,
	slug TEXT,
	permaslug TEXT,
	candidate_index INTEGER,
	selected_permaslug TEXT,
	metric TEXT,
	x TEXT,
	series TEXT,
	value REAL,
	series_token_weight REAL,
	throughput_tokens_per_second_median REAL,
	latency_seconds_median REAL,
	e2e_latency_seconds_median REAL,
	weighted_input_price_per_1m REAL,
	weighted_output_price_per_1m REAL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS agent_arena_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	rank INTEGER NOT NULL,
	contender_name TEXT NOT NULL,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	organization TEXT NOT NULL,
	score REAL NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS agents_last_exam_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	split TEXT NOT NULL,
	harness TEXT,
	model TEXT NOT NULL,
	harness_variant TEXT,
	runs INTEGER,
	tasks INTEGER,
	split_tasks INTEGER,
	passes INTEGER,
	accuracy REAL,
	score REAL,
	total_duration_seconds REAL,
	total_input_tokens REAL,
	total_output_tokens REAL,
	total_cost_usd REAL,
	cost_source TEXT,
	median_accuracy REAL,
	mean_accuracy REAL,
	median_score REAL,
	mean_score REAL,
	median_total_duration_seconds REAL,
	mean_total_duration_seconds REAL,
	median_total_input_tokens REAL,
	mean_total_input_tokens REAL,
	median_total_output_tokens REAL,
	mean_total_output_tokens REAL,
	median_duration_seconds_per_task REAL,
	mean_duration_seconds_per_task REAL,
	median_input_tokens_per_task REAL,
	mean_input_tokens_per_task REAL,
	median_output_tokens_per_task REAL,
	mean_output_tokens_per_task REAL,
	median_cost_usd_per_task REAL,
	mean_cost_usd_per_task REAL,
	frequency INTEGER,
	row_kind TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS blueprint_bench_2_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	model TEXT NOT NULL,
	score REAL NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS browsecomp_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	model TEXT NOT NULL,
	provider TEXT NOT NULL,
	provider_name TEXT,
	score REAL NOT NULL,
	source_url TEXT,
	analysis_method TEXT,
	verified INTEGER,
	self_reported INTEGER,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS chartography_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS chess_puzzles_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS cursorbench_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	rank INTEGER NOT NULL,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	score_eligible INTEGER NOT NULL,
	score REAL NOT NULL,
	cost_per_task_usd REAL NOT NULL,
	tokens_per_task INTEGER NOT NULL,
	steps_per_task INTEGER NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS deep_swe_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	source_version TEXT,
	model TEXT NOT NULL,
	reasoning_effort TEXT,
	config TEXT,
	pass_at_1 REAL NOT NULL,
	ci_lo REAL,
	ci_hi REAL,
	ci_half REAL,
	n_tasks_attempted INTEGER,
	mean_cost_usd REAL NOT NULL,
	mean_duration_seconds REAL,
	mean_output_tokens REAL NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS ebr_bench_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS enterprisebench_corecraft_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS epoch_capabilities_index_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS frontiermath_tier_4_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS gdp_pdf_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	provider TEXT,
	model TEXT NOT NULL,
	score REAL NOT NULL,
	last_updated TEXT,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS handbook_md_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS mercor_apex_agents_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	model_id TEXT NOT NULL,
	source_model TEXT NOT NULL,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	organization TEXT NOT NULL,
	score REAL NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS proofbench_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS riemann_bench_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	provider TEXT,
	model TEXT NOT NULL,
	score REAL NOT NULL,
	last_updated TEXT,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS vals_terminal_bench_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	task TEXT NOT NULL,
	task_label TEXT NOT NULL,
	row_kind TEXT NOT NULL,
	source_model_id TEXT,
	model_id TEXT NOT NULL,
	model TEXT NOT NULL,
	provider TEXT,
	harness TEXT,
	score REAL NOT NULL,
	cost_per_task_usd REAL,
	seconds_per_task REAL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS toolathlon_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	rank INTEGER,
	model TEXT NOT NULL,
	provider TEXT NOT NULL,
	provider_name TEXT,
	score REAL NOT NULL,
	source_url TEXT,
	analysis_method TEXT,
	verified INTEGER,
	self_reported INTEGER,
	announcement_date TEXT,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS vals_index_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	task TEXT NOT NULL,
	task_label TEXT NOT NULL,
	row_kind TEXT NOT NULL,
	model_id TEXT NOT NULL,
	model TEXT NOT NULL,
	provider TEXT,
	score REAL NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS vending_bench_2_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	url TEXT NOT NULL,
	data_url TEXT,
	rank INTEGER NOT NULL,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	run_count INTEGER NOT NULL,
	final_balance_usd REAL NOT NULL,
	daily_balance_usd_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS weirdml_raw_rows (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	fetched_at_epoch_seconds INTEGER,
	benchmark_key TEXT NOT NULL,
	source TEXT NOT NULL,
	url TEXT NOT NULL,
	model_id TEXT,
	model TEXT NOT NULL,
	base_model TEXT NOT NULL,
	reasoning_effort TEXT,
	provider TEXT,
	rank INTEGER,
	score REAL NOT NULL,
	score_eligible INTEGER NOT NULL,
	standard_error REAL,
	confidence_low REAL,
	confidence_high REAL,
	observed_at TEXT,
	metadata_json TEXT NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS source_quarantines (
	run_id INTEGER NOT NULL,
	source TEXT NOT NULL,
	row_key TEXT NOT NULL,
	missing_from_source_since_epoch_seconds INTEGER,
	PRIMARY KEY (run_id, source, row_key)
);

CREATE TABLE IF NOT EXISTS source_health (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	source TEXT NOT NULL,
	status TEXT NOT NULL,
	last_fetch_epoch_seconds INTEGER,
	source_input_count INTEGER NOT NULL,
	active_row_count INTEGER NOT NULL,
	quarantined_row_count INTEGER NOT NULL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS models (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	model_id TEXT,
	provider_id TEXT,
	name TEXT,
	reasoning_effort TEXT,
	logo TEXT,
	reasoning INTEGER,
	release_date TEXT,
	open_weights INTEGER,
	context INTEGER,
	context_input INTEGER,
	context_output INTEGER,
	input_modality_text INTEGER,
	input_modality_image INTEGER,
	input_modality_audio INTEGER,
	input_modality_video INTEGER,
	throughput_tokens_per_second_median REAL,
	latency_seconds_median REAL,
	e2e_latency_seconds_median REAL,
	cost_input REAL,
	cost_output REAL,
	cost_cache_read REAL,
	cost_cache_write REAL,
	cost_weighted_input REAL,
	cost_weighted_output REAL,
	cost_blended_price REAL,
	context_over_200k_input REAL,
	context_over_200k_output REAL,
	context_over_200k_cache_read REAL,
	context_over_200k_cache_write REAL,
	intelligence_index REAL,
	agentic_index REAL,
	coding_index REAL,
	omniscience_index REAL,
	omniscience_accuracy REAL,
	component_intelligence_score REAL,
	component_agentic_score REAL,
	component_speed_score REAL,
	intelligence_score REAL,
	agentic_score REAL,
	speed_score REAL,
	value_score REAL,
	PRIMARY KEY (run_id, row_index)
);

CREATE TABLE IF NOT EXISTS model_evaluations (
	run_id INTEGER NOT NULL,
	model_row_index INTEGER NOT NULL,
	benchmark_key TEXT NOT NULL,
	value REAL NOT NULL,
	PRIMARY KEY (run_id, model_row_index, benchmark_key)
);

CREATE TABLE IF NOT EXISTS model_task_metrics (
	run_id INTEGER NOT NULL,
	model_row_index INTEGER NOT NULL,
	source_key TEXT NOT NULL,
	cost REAL,
	seconds REAL,
	tokens REAL,
	input_tokens REAL,
	output_tokens REAL,
	PRIMARY KEY (run_id, model_row_index, source_key)
);

CREATE TABLE IF NOT EXISTS model_match_debug (
	run_id INTEGER NOT NULL,
	row_index INTEGER NOT NULL,
	artificial_analysis_id TEXT,
	artificial_analysis_slug TEXT,
	artificial_analysis_name TEXT,
	artificial_analysis_raw_row_index INTEGER,
	candidate_rank INTEGER,
	candidate_model_id TEXT,
	candidate_provider_id TEXT,
	candidate_provider_name TEXT,
	candidate_name TEXT,
	candidate_score REAL,
	selected INTEGER,
	rejection_reason TEXT,
	selected_model_id TEXT,
	models_dev_row_index INTEGER,
	openrouter_model_id TEXT,
	openrouter_model_stats_row_index INTEGER,
	PRIMARY KEY (run_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_artificial_analysis_raw_models_model_id
	ON artificial_analysis_raw_models(model_id);
CREATE INDEX IF NOT EXISTS idx_models_dev_raw_models_model_id ON models_dev_raw_models(model_id);
CREATE INDEX IF NOT EXISTS idx_openrouter_raw_rows_model_id ON openrouter_raw_rows(model_id);
CREATE INDEX IF NOT EXISTS idx_model_match_debug_artificial_analysis_id
	ON model_match_debug(artificial_analysis_id);
CREATE INDEX IF NOT EXISTS idx_model_match_debug_candidate_model_id
	ON model_match_debug(candidate_model_id);
CREATE INDEX IF NOT EXISTS idx_model_match_debug_selected_model_id
	ON model_match_debug(selected_model_id);
