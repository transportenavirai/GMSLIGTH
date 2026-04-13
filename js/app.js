// =============================================================================
//  ⚙️  SISTEMA — NÃO EDITAR ESTE ARQUIVO
//  As configurações ficam em js/config.js
// =============================================================================

// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────────
let ALL_ROWS = [], ESCALA_ROWS = [], MOT_COLORS = {};
let selMes = new Set(), selSem = new Set(), selMot = new Set(), selVei = new Set();
let logRows = [];
let retryCount = 0, cdTimer = null, fetchTimer = null, nextAt = null, firstLoad = true;

// =============================================================================
//  UTILITÁRIOS
// =============================================================================
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function norm(s) {
  return String(s).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function initials(n) {
  const p = n.split(" ");
  return p.length >= 2 ? p[0][0] + p[1][0] : n.substring(0, 2);
}

// Tooltip
const tip = document.getElementById("tip");
function showTip(e, h) { tip.innerHTML = h; tip.style.display = "block"; moveTip(e); }
function moveTip(e)     { tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY - 10) + "px"; }
function hideTip()      { tip.style.display = "none"; }

// Countdown
function startCountdown() {
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = setInterval(() => {
    if (!nextAt) return;
    const s  = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
    const el = document.getElementById("cdSec");
    if (el) el.textContent = s + "s";
    if (s === 0) clearInterval(cdTimer);
  }, 500);
}

// Timer de fetch
function scheduleFetch(delay) {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchLive, delay);
}

// =============================================================================
//  ABAS
// =============================================================================
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("tab"   + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add("active");
  document.getElementById("panel" + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add("active");
}

// =============================================================================
//  PARSE DO CSV
// =============================================================================
function parseCSV(text) {
  const mNames = ["","JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  const stats = [], escala = [];

  for (const line of text.split(/\r?\n/)) {
    const p = [];
    let cur = "", inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { p.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    p.push(cur.trim());
    if (p.length < 3) continue;

    const veiculo   = (p[0] || "").toUpperCase();
    const motorista = (p[1] || "").toUpperCase();
    const destino   = (p[2] || "").toUpperCase();

    if (!motorista || motorista === "MOTORISTA" || motorista.startsWith("-")) continue;
    if (/^[0-9]{1,2}\/[0-9]{1,2}/.test(motorista)) continue;
    if (!destino || destino === "DESTINO" || destino.startsWith("-")) continue;

    // Veículo opcional para férias/recesso/disponível
    const isVeiOpcional = destino.includes("FERIAS") || destino.includes("RECESSO") || destino.includes("DISPONIVEL");
    if (!isVeiOpcional) {
      if (!veiculo || veiculo === "VEICULO" || veiculo === "VEICULOS / MOTORISTAS") continue;
    }
    if (veiculo === "VEICULO" || veiculo === "VEICULOS / MOTORISTAS") continue;

    const saida = (p[3] || "").trim();
    const pac   = (p[4] || "").trim();
    const obs   = (p[5] || "").trim();
    let   data  = (p[6] || "").trim();
    const ok    = (p[7] || "").trim().toUpperCase();
    const mes   = (p[8] || "").toUpperCase();

    if (!data || !data.includes("/")) continue;

    // Normaliza ano de 2 dígitos (ex: 20/03/26 → 20/03/2026)
    const dpNorm = data.split("/");
    if (dpNorm.length === 3 && dpNorm[2].length === 2) {
      data = dpNorm[0] + "/" + dpNorm[1] + "/20" + dpNorm[2];
    }

    let day = 1, wk = "Sem 1", mesFinal = mes || "?";
    try {
      const dp = data.split("/");
      day = parseInt(dp[0]) || 1;
      wk  = "Sem " + Math.min(5, Math.floor((day - 1) / 7) + 1);
      if (!mes || mes === "?") {
        const mn = parseInt(dp[1]) || 0;
        if (mn >= 1 && mn <= 12) mesFinal = mNames[mn];
      }
    } catch(e) {}

    const row = { v: veiculo, m: motorista, d: destino, dt: data,
                  mes: mesFinal, day, wk, ok: ok === "OK" ? "OK" : "",
                  saida, pac, obs };

    // Escala: tudo exceto viagens já confirmadas
    if (ok !== "OK") escala.push(row);

    // Estatísticas: exclui categorias especiais, inclui OK (histórico)
    let skip = false;
    for (const s of SKIP) { if (destino.includes(s)) { skip = true; break; } }
    if (!skip) stats.push(row);
  }

  return { stats, escala };
}

// =============================================================================
//  FETCH — BUSCA OS DADOS DA PLANILHA
// =============================================================================
async function fetchLive() {
  if (fetchTimer) clearTimeout(fetchTimer);
  const banner = document.getElementById("banner");
  banner.style.display = "flex";
  banner.innerHTML = `<span style="color:var(--accent)">⏳ Atualizando...</span> · Buscando planilha...`;

  try {
    const res = await fetch(CSV_URL + "&cachebust=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const parsed = parseCSV(await res.text());
    if (parsed.stats.length < 3) throw new Error("Dados insuficientes — planilha publicada?");

    ALL_ROWS    = parsed.stats;
    ESCALA_ROWS = parsed.escala;
    retryCount  = 0;

    // Mantém cores existentes — só adiciona novos motoristas
    const allMots = [...new Set([...ALL_ROWS, ...ESCALA_ROWS].map(r => r.m))].sort();
    allMots.forEach((m, i) => { if (!MOT_COLORS[m]) MOT_COLORS[m] = COLORS[i % COLORS.length]; });

    if (firstLoad) {
      document.getElementById("loadingScreen").classList.add("hidden");
      document.getElementById("mainContent").style.display = "";
      firstLoad = false;
    }
    buildFilters();
    render();

    nextAt = Date.now() + REFRESH_MS;
    const tag = document.getElementById("statusTag");
    tag.className = "tag tag-live";
    tag.innerHTML = `<span class="live-dot"></span>AO VIVO · ${parsed.stats.length} viagens`;
    banner.innerHTML =
      `<span style="color:var(--green)">🟢 Atualizado às ${new Date().toLocaleTimeString("pt-BR")}</span>` +
      ` · <b style="color:var(--accent)">${parsed.stats.length} viagens</b>` +
      ` · próx. em <b id="cdSec">${Math.ceil(REFRESH_MS / 1000)}s</b>` +
      ` &nbsp;<button class="btn" id="btnBannerNow" style="font-size:10px;padding:3px 10px">⟳ Agora</button>`;
    document.getElementById("btnBannerNow").addEventListener("click", fetchLive);
    document.getElementById("tsLbl").textContent = "🔄 Dados ao vivo · atualizado às " + new Date().toLocaleTimeString("pt-BR");
    startCountdown();
    scheduleFetch(REFRESH_MS);

  } catch(err) {
    retryCount++;
    if (firstLoad && ALL_ROWS.length === 0) {
      document.getElementById("loadingScreen").classList.add("hidden");
      const es = document.getElementById("errorScreen");
      es.style.display = "flex";
      document.getElementById("errorMsg").textContent = err.message;
      scheduleFetch(RETRY_MS);
      return;
    }
    const delay = retryCount <= MAX_RETRY ? RETRY_MS : REFRESH_MS;
    nextAt = Date.now() + delay;
    const tag = document.getElementById("statusTag");
    tag.className = "tag tag-off";
    tag.innerHTML = "⚠️ Offline";
    banner.innerHTML =
      `<span style="color:var(--gold)">⚠️ Usando dados anteriores</span>` +
      ` · Erro: ${err.message} · retry em <b id="cdSec">${Math.ceil(delay / 1000)}s</b>` +
      ` &nbsp;<button class="btn" id="btnBannerRetry" style="font-size:10px;padding:3px 10px">⟳ Tentar</button>`;
    document.getElementById("btnBannerRetry").addEventListener("click", fetchLive);
    document.getElementById("tsLbl").textContent = "Dados anteriores · " + new Date().toLocaleTimeString("pt-BR");
    startCountdown();
    scheduleFetch(delay);
  }
}

// Pausa fetch quando aba fica em background
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (cdTimer) clearInterval(cdTimer);
    if (fetchTimer) clearTimeout(fetchTimer);
  } else {
    if (nextAt && Date.now() > nextAt - REFRESH_MS / 2) {
      fetchLive();
    } else if (nextAt) {
      scheduleFetch(Math.max(0, nextAt - Date.now()));
    }
  }
});

// =============================================================================
//  FILTROS
// =============================================================================
function getFiltered() {
  return ALL_ROWS.filter(r =>
    (selMes.size === 0 || selMes.has(r.mes)) &&
    (selSem.size === 0 || selSem.has(r.wk))  &&
    (selMot.size === 0 || selMot.has(r.m))   &&
    (selVei.size === 0 || selVei.has(r.v))
  );
}

function resetFilters() {
  selMes = new Set(); selSem = new Set(); selMot = new Set(); selVei = new Set();
  buildFilters(); render();
}

// Chips usam addEventListener para evitar XSS com aspas nos nomes
function buildFilters() {
  const meses = [...new Set(ALL_ROWS.map(r => r.mes))].sort();
  const sems  = [...new Set(ALL_ROWS.map(r => r.wk))].sort();
  const mots  = [...new Set(ALL_ROWS.map(r => r.m))].sort();
  const veis  = [...new Set(ALL_ROWS.map(r => r.v).filter(v => v && v !== "N/D"))].sort();

  function makeChips(containerId, items, set, cls, colorFn) {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    items.forEach(val => {
      const btn = document.createElement("button");
      btn.className = "chip" + (set.has(val) ? " " + cls : "");
      btn.textContent = val;
      btn.dataset.val = val;
      if (colorFn && set.has(val)) colorFn(btn, val);
      btn.addEventListener("click", () => {
        if (set.has(val)) {
          set.delete(val);
          btn.className = "chip";
          btn.removeAttribute("style");
        } else {
          set.add(val);
          btn.className = "chip " + cls;
          if (colorFn) colorFn(btn, val);
        }
        render();
      });
      el.appendChild(btn);
    });
  }

  makeChips("fMes", meses, selMes, "on", null);
  makeChips("fSem", sems,  selSem, "on-gold", null);
  makeChips("fMot", mots,  selMot, "on", (btn, m) => {
    const c = MOT_COLORS[m];
    if (c) btn.style.cssText = `border-color:${c};color:${c};background:${c}22`;
  });
  makeChips("fVei", veis, selVei, "on-purple", null);
}

// =============================================================================
//  EXPORTAR CSV
// =============================================================================
function exportCSV(rows, filename) {
  const header = ["Data","Motorista","Destino","Veiculo","Mes","Semana","Saida","Pacientes","Obs"];
  const lines  = [header.join(";")];
  rows.forEach(r => {
    lines.push([r.dt, r.m, r.d, r.v, r.mes, r.wk, r.saida, r.pac, r.obs]
      .map(v => '"' + String(v || "").replace(/"/g, '""') + '"').join(";"));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = filename || "gms_export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// =============================================================================
//  RENDER ESTATÍSTICAS
// =============================================================================
function render() {
  const rows = getFiltered();
  document.getElementById("fResult").innerHTML =
    `<span style="font-size:26px;font-weight:800;color:var(--accent)">${rows.length}</span>` +
    ` <span style="font-size:13px;color:var(--muted);font-family:'Barlow',sans-serif;font-weight:400">viagens</span>`;

  // Agrega por motorista
  const motMap = {};
  rows.forEach(r => {
    if (!motMap[r.m]) motMap[r.m] = { name: r.m, color: MOT_COLORS[r.m] || COLORS[0], init: initials(r.m), trips: 0, dests: {}, veis: {}, weeks: {} };
    motMap[r.m].trips++;
    motMap[r.m].dests[r.d] = (motMap[r.m].dests[r.d] || 0) + 1;
    motMap[r.m].veis[r.v]  = (motMap[r.m].veis[r.v]  || 0) + 1;
    motMap[r.m].weeks[r.wk]= (motMap[r.m].weeks[r.wk]|| 0) + 1;
  });

  const list  = Object.values(motMap).sort((a, b) => b.trips - a.trips);
  list.forEach(d => {
    d.topDest = Object.entries(d.dests).sort((a,b) => b[1]-a[1])[0]?.[0] || "";
    d.topVei  = Object.entries(d.veis).sort((a,b)  => b[1]-a[1])[0]?.[0] || "";
  });

  const total  = list.reduce((s, d) => s + d.trips, 0);
  const avg    = list.length ? total / list.length : 0;
  const max    = list.length ? Math.max(...list.map(d => d.trips)) : 0;
  const min    = list.length ? Math.min(...list.map(d => d.trips)) : 0;
  const period = [...selMes].join(", ") || "Todos os meses";

  // Índice de equidade — N/A com menos de 3 motoristas
  const eqEl  = document.getElementById("eqScore");
  const eqSub = document.getElementById("eqScoreSub");
  if (list.length < 3) {
    eqEl.textContent = "N/A";
    eqEl.className   = "eq-score na";
    eqSub.textContent= "dados insuficientes";
  } else {
    const equity = Math.max(0, Math.round(100 - ((max - min) / Math.max(avg, 1) * 40)));
    eqEl.textContent = equity;
    eqEl.className   = "eq-score";
    eqSub.textContent= "/ 100";
  }

  // KPIs
  document.getElementById("kT").textContent   = total;
  document.getElementById("kP").textContent   = period;
  document.getElementById("kA").textContent   = Math.round(avg);
  document.getElementById("kD").textContent   = new Set(rows.map(r => r.d)).size;
  document.getElementById("kTop").textContent = max || "--";
  document.getElementById("kTopN").textContent= list[0]?.name || "--";
  document.getElementById("kV").textContent   = max - min;
  document.getElementById("avgLbl").textContent   = Math.round(avg);
  document.getElementById("tblSub").textContent   = `${list.length} motoristas · ${period}`;
  document.getElementById("destSub").textContent  = `${new Set(rows.map(r => r.d)).size} destinos`;
  document.getElementById("veiSub").textContent   = `${new Set(rows.map(r => r.v).filter(v => v && v !== "N/D")).size} veículos`;
  document.getElementById("donutN").textContent   = total;

  if (!list.length) {
    const e = '<tr><td colspan="10" class="empty">Nenhuma viagem encontrada.</td></tr>';
    ["drvTbody","destTbody","veiTbody","logTbody"].forEach(id => document.getElementById(id).innerHTML = e);
    document.getElementById("eqGrid").innerHTML   = '<div class="empty">Sem dados.</div>';
    document.getElementById("heatWrap").innerHTML = '<div class="empty">Sem dados.</div>';
    document.getElementById("wChart").innerHTML   = "";
    renderEscala();
    return;
  }

  // ── Ranking ──
  document.getElementById("drvTbody").innerHTML = list.map((d, i) => {
    const diff = Math.round(d.trips - avg);
    const bdg  = diff > 3  ? `<span class="bdg bdg-g">+${diff}</span>`
               : diff < -3 ? `<span class="bdg bdg-r">${diff}</span>`
               :              `<span class="bdg bdg-y">≈ média</span>`;
    return `<tr>
      <td style="color:var(--muted);font-weight:700;font-size:10px">${i+1}º</td>
      <td><div class="drv-info">
        <div class="av" style="background:${d.color}18;color:${d.color};border:1.5px solid ${d.color}50">${esc(d.init)}</div>
        <div><div class="drv-name">${esc(d.name)}</div><div class="drv-sub">${esc(d.topDest)}</div></div>
      </div></td>
      <td><span class="n-big" style="color:${d.color}">${d.trips}</span></td>
      <td><div class="bar-row"><div class="bar-bg"><div class="bar-fill" style="width:${(d.trips/max*100).toFixed(1)}%;background:${d.color}"></div></div><span class="bar-pct">${(d.trips/total*100).toFixed(1)}%</span></div></td>
      <td style="font-size:10px;color:var(--muted)">${esc(d.topDest) || "-"}</td>
      <td style="font-size:10px;color:var(--muted)">${esc(d.topVei)  || "-"}</td>
      <td>${bdg}</td>
    </tr>`;
  }).join("");

  // ── Donut ──
  const svg = document.getElementById("donutSvg");
  const cx = 70, cy = 70, r = 58, sw = 15, circ = 2 * Math.PI * r;
  svg.innerHTML = "";
  const bg = document.createElementNS("http://www.w3.org/2000/svg","circle");
  bg.setAttribute("cx",cx); bg.setAttribute("cy",cy); bg.setAttribute("r",r);
  bg.setAttribute("fill","none"); bg.setAttribute("stroke","#e8eef4"); bg.setAttribute("stroke-width",sw);
  svg.appendChild(bg);
  let off = 0;
  list.forEach(d => {
    const pct = d.trips / total, dash = pct * circ;
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx",cx); c.setAttribute("cy",cy); c.setAttribute("r",r);
    c.setAttribute("fill","none"); c.setAttribute("stroke",d.color); c.setAttribute("stroke-width",sw);
    c.setAttribute("stroke-dasharray",`${Math.max(0,dash-1)} ${circ-Math.max(0,dash-1)}`);
    c.setAttribute("stroke-dashoffset",-off*circ);
    svg.appendChild(c); off += pct;
  });
  document.getElementById("donutLeg").innerHTML = list.slice(0,8).map(d =>
    `<div class="leg-item"><div class="leg-l"><div class="leg-dot" style="background:${d.color}"></div><span class="leg-n">${esc(d.name.split(" ")[0])}</span></div><div class="leg-r"><span class="leg-pct" style="color:${d.color}">${(d.trips/total*100).toFixed(1)}%</span><span class="leg-t">${d.trips}v</span></div></div>`
  ).join("");

  // ── Equidade individual ──
  document.getElementById("eqGrid").innerHTML = list.map(d => {
    const diff = Math.round(d.trips - avg);
    const cls  = diff > 3 ? "up" : diff < -3 ? "dn" : "eq";
    return `<div class="eq-card">
      <div class="eq-av" style="background:${d.color}18;color:${d.color};border:1.5px solid ${d.color}50">${esc(d.init)}</div>
      <div class="eq-trips" style="color:${d.color}">${d.trips}</div>
      <div class="eq-name">${esc(d.name.split(" ")[0])}</div>
      <div class="eq-diff ${cls}">${diff > 0 ? "+" : ""}${diff} vs média</div>
    </div>`;
  }).join("");

  // ── Mapa de calor ──
  const dc   = {};
  rows.forEach(r => dc[r.d] = (dc[r.d] || 0) + 1);
  const topD = Object.entries(dc).sort((a,b) => b[1]-a[1]).slice(0,10).map(e => e[0]);
  const maxV = Math.max(...list.flatMap(d => topD.map(dest => d.dests[dest] || 0)), 1);
  let hh = `<div class="heat-hdr">${topD.map(d => `<span title="${esc(d)}">${esc(d.substring(0,5))}</span>`).join("")}</div>`;
  list.forEach(d => {
    hh += `<div class="heat-row"><div class="heat-lbl">${esc(d.name.split(" ")[0])}</div>`;
    topD.forEach(dest => {
      const v     = d.dests[dest] || 0;
      const alpha = v > 0 ? Math.min(1, .25 + v/maxV*.75) : .08;
      const bg2   = v > 0 ? `background:${d.color};opacity:${alpha}` : "background:var(--s3)";
      hh += `<div class="heat-cell" style="${bg2}" onmouseenter="showTip(event,'<b>${esc(d.name)}</b> → ${esc(dest)}<br>${v} viagens')" onmouseleave="hideTip()" onmousemove="moveTip(event)">${v || ""}</div>`;
    });
    hh += "</div>";
  });
  document.getElementById("heatWrap").innerHTML = hh;

  // ── Gráfico semanal ──
  const weeks = [...new Set(rows.map(r => r.wk))].sort();
  const maxW  = Math.max(...list.flatMap(d => weeks.map(w => d.weeks[w] || 0)), 1);
  document.getElementById("wChart").innerHTML = weeks.map(w => {
    const bars = list.map(d => {
      const v = d.weeks[w] || 0;
      return `<div class="wchart-bar" style="background:${d.color};height:${v?(v/maxW*110).toFixed(1):2}px;opacity:${v?1:.15}" onmouseenter="showTip(event,'<b>${esc(d.name)}</b><br>${w}: <b>${v}</b> viagens')" onmouseleave="hideTip()" onmousemove="moveTip(event)"></div>`;
    }).join("");
    return `<div class="wchart-col"><div class="wchart-group">${bars}</div><div class="wchart-lbl">${w}</div></div>`;
  }).join("");
  document.getElementById("wLeg").innerHTML = list.map(d =>
    `<div class="wleg"><div class="wleg-dot" style="background:${d.color}"></div>${esc(d.name.split(" ")[0])}</div>`
  ).join("");

  // ── Destinos ──
  const dmap = {}, dmot = {};
  rows.forEach(r => {
    dmap[r.d] = (dmap[r.d] || 0) + 1;
    if (!dmot[r.d]) dmot[r.d] = new Set();
    dmot[r.d].add(r.m.split(" ")[0]);
  });
  const dsorted = Object.entries(dmap).sort((a,b) => b[1]-a[1]);
  const dmaxT   = dsorted[0]?.[1] || 1;
  const dtot    = dsorted.reduce((s,e) => s+e[1], 0);
  document.getElementById("destTbody").innerHTML = dsorted.map(([d,t]) =>
    `<tr><td><div class="dest-name">📍 ${esc(d)}</div><div class="dest-who">${[...dmot[d]].map(esc).join(", ")}</div></td>
    <td style="font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:800;color:var(--gold)">${t}</td>
    <td><div class="bar-row"><div class="bar-bg"><div class="bar-fill" style="width:${(t/dmaxT*100).toFixed(1)}%;background:var(--gold)"></div></div><span class="bar-pct">${(t/dtot*100).toFixed(1)}%</span></div></td>
    <td style="font-size:9px;color:var(--muted)">${[...dmot[d]].slice(0,4).map(esc).join(", ")}</td></tr>`
  ).join("");

  // ── Veículos ──
  const vc = {}, vm = {};
  rows.filter(r => r.v && r.v !== "N/D").forEach(r => {
    vc[r.v] = (vc[r.v] || 0) + 1;
    if (!vm[r.v]) vm[r.v] = new Set();
    vm[r.v].add(r.m.split(" ")[0]);
  });
  const vsorted = Object.entries(vc).sort((a,b) => b[1]-a[1]);
  const vmaxT   = vsorted[0]?.[1] || 1;
  const vtot    = vsorted.reduce((s,e) => s+e[1], 0);
  document.getElementById("veiTbody").innerHTML = vsorted.map(([v,t]) =>
    `<tr><td><div class="dest-name">🚗 ${esc(v)}</div><div class="dest-who">${[...vm[v]].map(esc).join(", ")}</div></td>
    <td style="font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:800;color:var(--purple)">${t}</td>
    <td><div class="bar-row"><div class="bar-bg"><div class="bar-fill" style="width:${(t/vmaxT*100).toFixed(1)}%;background:var(--purple)"></div></div><span class="bar-pct">${(t/vtot*100).toFixed(1)}%</span></div></td>
    <td style="font-size:9px;color:var(--muted)">${[...vm[v]].slice(0,3).map(esc).join(", ")}</td></tr>`
  ).join("");

  // ── Log ──
  logRows = [...rows].sort((a,b) =>
    b.dt.split("/").reverse().join("").localeCompare(a.dt.split("/").reverse().join(""))
  );
  renderLog();
  renderEscala();
}

// =============================================================================
//  RENDER LOG
// =============================================================================
function renderLog() {
  const q = norm(document.getElementById("logSearch").value || "");
  const filtered = q
    ? logRows.filter(r => norm(r.m).includes(q) || norm(r.d).includes(q) || norm(r.v).includes(q) || r.dt.includes(q))
    : logRows;

  document.getElementById("logSub").textContent = `${filtered.length} de ${logRows.length} viagens`;
  document.getElementById("logTbody").innerHTML = filtered.slice(0, 5000).map(r =>
    `<tr>
      <td style="color:var(--muted)">${esc(r.dt)}</td>
      <td><span style="color:${MOT_COLORS[r.m]||'#555'};font-weight:600">${esc(r.m)}</span></td>
      <td>📍 ${esc(r.d)}</td>
      <td style="color:var(--muted);font-size:10px">${esc(r.v)}</td>
      <td><span style="background:#e6f9f2;color:var(--accent);border:1px solid #9adfc5;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700">${esc(r.mes)}</span></td>
      <td style="color:var(--muted);font-size:10px">${esc(r.wk)}</td>
    </tr>`
  ).join("");

  // Botão exportar log com dados visíveis
  document.getElementById("btnExportLog").onclick = () =>
    exportCSV(filtered, `gms_log_${new Date().toISOString().slice(0,10)}.csv`);
}

// =============================================================================
//  RENDER ESCALA DO DIA
// =============================================================================
function renderEscala() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const hd   = ("0" + hoje.getDate()).slice(-2);
  const hm   = ("0" + (hoje.getMonth()+1)).slice(-2);
  const hy   = hoje.getFullYear();
  const hojeStr = hd + "/" + hm + "/" + hy;

  const rows = ESCALA_ROWS.filter(r => {
    if (!r.dt || !r.dt.includes("/")) return false;
    const dp    = r.dt.split("/");
    if (dp.length < 3) return false;
    const rDate = new Date(parseInt(dp[2]), parseInt(dp[1])-1, parseInt(dp[0]));
    rDate.setHours(0, 0, 0, 0);
    return rDate >= hoje;
  });

  // Próxima data com viagens pendentes
  const datasOrdenadas = [...new Set(rows.map(r => r.dt))].sort((a,b) =>
    a.split("/").reverse().join("").localeCompare(b.split("/").reverse().join(""))
  );
  const proximaData   = datasOrdenadas[0] || hojeStr;
  const isProximaHoje = proximaData === hojeStr;
  const rowsProxima   = rows.filter(r => r.dt === proximaData);

  // "Em Serviço" = motoristas únicos na próxima data excluindo dispensas
  const ativasServico = rowsProxima.filter(r => {
    const du = norm(r.d);
    for (const s of SKIP_SERVICO) { if (du.includes(norm(s))) return false; }
    return true;
  });
  const motoristasEmServico = new Set(ativasServico.map(r => r.m)).size;

  // Viagens e pacientes da próxima data
  const viagensProxima = rowsProxima.filter(r => {
    const du = norm(r.d);
    for (const s of SKIP_KPI) { if (du.includes(norm(s))) return false; }
    return true;
  });
  const pacProxima   = viagensProxima.reduce((s, r) => s + (parseInt(r.pac) || 0), 0);
  const motoristas   = new Set(rows.map(r => r.m)).size;

  // Labels dinâmicos
  const labelViagens = isProximaHoje ? "Viagens Hoje"   : `Viagens ${proximaData}`;
  const labelPac     = isProximaHoje ? "Pacientes Hoje" : `Pacientes ${proximaData}`;
  document.getElementById("ekDestLbl").textContent = labelViagens;
  document.getElementById("ekPacLbl").textContent  = labelPac;

  document.getElementById("ekTotal").textContent   = motoristas            || "--";
  document.getElementById("ekAtivos").textContent  = motoristasEmServico   || "--";
  document.getElementById("ekDest").textContent    = viagensProxima.length || "--";
  document.getElementById("ekPac").textContent     = pacProxima            || "--";
  document.getElementById("escalaCount").textContent =
    rows.length + " viagem" + (rows.length !== 1 ? "s" : "") + " · a partir de " + hojeStr;
  document.getElementById("escalaInfo").textContent =
    "Atualizado às " + new Date().toLocaleTimeString("pt-BR");

  const tbody = document.getElementById("escalaTbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--muted)">📭 Nenhuma viagem pendente a partir de ${esc(hojeStr)}</td></tr>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => {
    const da = a.dt.split("/").reverse().join("");
    const db = b.dt.split("/").reverse().join("");
    if (da !== db) return da.localeCompare(db);
    return (a.saida || "99:99").localeCompare(b.saida || "99:99");
  });

  const diasSemana = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  let html2 = "", lastDt = "";

  sorted.forEach(r => {
    // Separador de data
    if (r.dt !== lastDt) {
      lastDt = r.dt;
      const dp    = r.dt.split("/");
      const rDate = new Date(parseInt(dp[2]), parseInt(dp[1])-1, parseInt(dp[0]));
      const isHoje      = rDate.getTime() === hoje.getTime();
      const diasFuturos = Math.round((rDate - hoje) / 864e5);
      const sufixo      = isHoje
        ? "<span style='color:var(--green);font-weight:800'>● HOJE</span>"
        : diasFuturos === 1
          ? "<span style='color:var(--muted)'>· amanhã</span>"
          : `<span style='color:var(--muted)'>· em ${diasFuturos} dias</span>`;
      const corData = isHoje ? "var(--green)" : "#1a5fa8";
      html2 += `<tr class='row-sep'><td colspan='7'><span style='color:${corData};font-weight:700'>${diasSemana[rDate.getDay()]} · ${esc(r.dt)}</span> ${sufixo}</td></tr>`;
    }

    const cor = MOT_COLORS[r.m] || "#555";
    const pts = r.m.split(" ");
    const ini = pts.length >= 2 ? pts[0][0] + pts[1][0] : r.m.substring(0, 2);

    const veiCell = r.v
      ? `<span class="vei-badge">${esc(r.v)}</span>`
      : `<span style="color:var(--muted)">—</span>`;

    const DU = norm(r.d);
    let destCell;
    if      (DU.includes("FERIAS") || DU.includes("RECESSO"))   destCell = `<span class="dest-ferias">🏖️ ${esc(r.d)}</span>`;
    else if (DU.includes("RURAL"))                               destCell = `<span class="dest-rural">🌾 ${esc(r.d)}</span>`;
    else if (DU.includes("HEMODIALISE") || DU.includes("HEMO")) destCell = `<span class="dest-hemo">🏥 ${esc(r.d)}</span>`;
    else if (DU.includes("MALOTE"))                              destCell = `<span class="dest-malote">📦 ${esc(r.d)}</span>`;
    else if (DU.includes("DISPONIVEL"))                          destCell = `<span class="dest-disp">✅ DISPONIVEL</span>`;
    else                                                          destCell = `<b class="dest-val">${esc(r.d)}</b>`;

    const saidaCell = r.saida ? `<span class="saida-val">${esc(r.saida)}</span>` : `<span style="color:var(--muted)">—</span>`;
    const pacCell   = r.pac   ? `<span class="pac-val">${esc(r.pac)}</span>`     : `<span style="color:var(--muted)">—</span>`;
    const obsCell   = r.obs   ? `<span class="obs-val">${esc(r.obs)}</span>`     : "";

    html2 += `<tr>
      <td><span class="escala-data">${esc(r.dt)}</span></td>
      <td><div class="mot-cell">
        <div class="mot-av" style="background:${cor}18;color:${cor};border:1.5px solid ${cor}50">${esc(ini)}</div>
        <span class="mot-nome" style="color:${cor}">${esc(r.m)}</span>
      </div></td>
      <td>${veiCell}</td>
      <td>${destCell}</td>
      <td>${saidaCell}</td>
      <td>${pacCell}</td>
      <td>${obsCell}</td>
    </tr>`;
  });

  tbody.innerHTML = html2;
}

// =============================================================================
//  EVENTOS E INICIALIZAÇÃO
// =============================================================================
document.getElementById("btnResetFilters").addEventListener("click", resetFilters);
document.getElementById("btnRefresh").addEventListener("click", fetchLive);
document.getElementById("btnRetryErr").addEventListener("click", fetchLive);
document.getElementById("tabEstatisticas").addEventListener("click", () => switchTab("estatisticas"));
document.getElementById("tabEscala").addEventListener("click", () => switchTab("escala"));
document.getElementById("logSearch").addEventListener("input", renderLog);
document.getElementById("btnExportCSV").addEventListener("click", () =>
  exportCSV(getFiltered(), `gms_filtrado_${new Date().toISOString().slice(0,10)}.csv`)
);

// Inicia a aplicação
fetchLive();
