// =============================================================================
//  ✏️  CONFIGURAÇÕES — EDITE APENAS ESTE ARQUIVO
//
//  Para atualizar: abra js/config.js no GitHub → ✏️ lápis → altere → Commit
// =============================================================================

// ── URL DA PLANILHA (Google Sheets publicado como CSV) ──
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQI6auY_9xHSJGEj2yjUXBCGyx3K9acP3qRApIm6EqTuXw6rtd6BArAH12OAJx8HtRqvpbDsiawgbc2/pub?gid=936830313&single=true&output=csv";

// ── INTERVALOS DE ATUALIZAÇÃO ──
const REFRESH_MS = 60 * 1000;  // Atualização automática: 60 segundos
const RETRY_MS   = 10 * 1000;  // Retry em caso de erro:  10 segundos
const MAX_RETRY  = 5;           // Máximo de tentativas antes de desistir

// ── DESTINOS IGNORADOS NAS ESTATÍSTICAS DE EQUIDADE ──
const SKIP = new Set([
  "FERIAS", "RECESSO", "RURAL", "HEMODIALISE",
  "MALOTE", "DISPONIVEL", "TRANSITO", "TRÂNSITO", "CANCELADA"
]);

// ── DESTINOS IGNORADOS NOS KPIs GERAIS DA ESCALA ──
const SKIP_KPI = new Set([
  "RURAL", "HEMODIALISE", "MALOTE", "DISPONIVEL",
  "TRANSITO", "TRÂNSITO", "FERIAS", "RECESSO", "CANCELADA"
]);

// ── IGNORADOS APENAS NO CONTADOR "EM SERVIÇO" ──
const SKIP_SERVICO = new Set([
  "DISPONIVEL", "FERIAS", "RECESSO", "CANCELADA"
]);

// ── PALETA DE CORES DOS MOTORISTAS ──
const COLORS = [
  "#0a7c55", "#1a5fa8", "#b07800", "#7a3fa8",
  "#c0283e", "#0e7a8a", "#5a7a20", "#a05800",
  "#1a6fa8", "#0a6644", "#884020", "#3a5fa8"
];
