import { useEffect, useMemo, useState } from "react";
import EarthGlobe from "./components/EarthGlobe.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MODES = [
  { id: "uv", label: "UV index", detail: "Monthly mean" },
  { id: "season", label: "Seasonality", detail: "Monthly profile" },
  { id: "anomaly", label: "Anomalies", detail: "Monthly deviation" },
  { id: "trend", label: "Long-term trend", detail: "Annual change" },
];
const fmt = (n, digits = 2) => Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : "—";

function Sparkline({ values, color = "#69d6c5", fill = true }) {
  const nums = values?.map(Number).filter(Number.isFinite) ?? [];
  if (!nums.length) return <div className="chart-empty">No series available</div>;
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const points = nums.map((v, i) => `${(i / Math.max(nums.length - 1, 1)) * 100},${90 - ((v - min) / span) * 78}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="UV time series">
    {[25, 50, 75].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} className="grid-line" />)}
    {fill && <polygon points={`0,100 ${points} 100,100`} fill={`${color}18`} />}
    <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function SeasonChart({ values }) {
  const safe = values?.map(Number) ?? [];
  const min = Math.min(...safe), max = Math.max(...safe), span = max - min || 1;
  return <div className="season-chart">{safe.map((v, i) => <div className="season-col" key={i}>
    <span className="season-value">{fmt(v, 1)}</span><i style={{ height: `${18 + 72 * (v - min) / span}%` }} /><small>{MONTHS[i]}</small>
  </div>)}</div>;
}

export default function App() {
  const [data, setData] = useState(null);
  const [features, setFeatures] = useState([]);
  const [links, setLinks] = useState([]);
  const [mode, setMode] = useState("uv");
  const [monthIndex, setMonthIndex] = useState(287);
  const [selectedId, setSelectedId] = useState("NEI");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [showLinks, setShowLinks] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/data/series_mensuales.json").then(r => { if (!r.ok) throw Error("series"); return r.json(); }),
      fetch("/data/earthscope_ciudades.geojson").then(r => { if (!r.ok) throw Error("cities"); return r.json(); }),
      fetch("/data/conexiones.geojson").then(r => { if (!r.ok) throw Error("links"); return r.json(); }),
    ]).then(([series, cityGeo, linkGeo]) => {
      setData(series);
      setFeatures(cityGeo.features);
      setLinks(linkGeo.features);
      setMonthIndex(series.fechas.length - 1);
    }).catch(() => setData({ error: true }));
  }, []);

  const cities = useMemo(() => features.map(f => ({ ...f.properties, id: f.properties.city_id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], _uv: data?.ciudades?.[f.properties.city_id]?.uv?.[monthIndex] ?? 0, _z: data?.ciudades?.[f.properties.city_id]?.z?.[monthIndex] ?? 0 })), [features, data, monthIndex]);
  const filtered = useMemo(() => cities.filter(c => (region === "all" || String(c.nivel) === region) && `${c.ciudad} ${c.pais} ${c.city_id}`.toLowerCase().includes(query.toLowerCase())), [cities, region, query]);
  const selected = cities.find(c => c.id === selectedId) ?? cities[0];
  const dates = data?.fechas ?? [];
  const date = dates[monthIndex] ?? "2024-12";
  const citySeries = selected && data?.ciudades?.[selected.id];
  const current = citySeries?.uv?.[monthIndex];
  const modeValue = (city) => {
    const s = data?.ciudades?.[city.id];
    if (!s) return 0;
    if (mode === "season") return city.climatologia?.[monthIndex % 12] ?? 0;
    if (mode === "anomaly") return s.z?.[monthIndex] ?? 0;
    if (mode === "trend") return city.sen_pendiente ?? 0;
    return s.uv?.[monthIndex] ?? 0;
  };

  if (data?.error) return <main className="load-error"><b>EarthScope data could not be loaded.</b><p>Check that the generated JSON and GeoJSON files exist in <code>public/data</code>.</p></main>;
  if (!data || !selected) return <main className="loading"><span className="orbit" />Loading EarthScope data…</main>;

  return <main className="workspace">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">E</span><span><b>EARTHSCOPE</b><small>NASA POWER · UV EXPLORER</small></span></a>
      <div className="top-meta"><span className="live-dot" /> DATASET <b>2001—2024</b><i /> MONTHLY <b>288</b><i /> LOCATIONS <b>{cities.length}</b></div>
      <button className="icon-button" title="About this dataset" onClick={() => window.alert("NASA POWER monthly UV index. City locations use a 1° grid. Correlation shows association, not causation.")}>i</button>
    </header>

    <aside className="sidebar">
      <div className="side-heading"><span className="eyebrow">GLOBAL OBSERVATORY</span><h1>Explore the<br/><em>UV signal.</em></h1><p>Compare long-term ultraviolet patterns across 100 cities worldwide.</p></div>
      <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a city…"/><kbd>/</kbd></label>
      <div className="filter-row"><span>LOCATIONS <b>{filtered.length}</b></span><select value={region} onChange={e => setRegion(e.target.value)}><option value="all">All regions</option><option value="1">Colombia</option><option value="2">South America</option><option value="3">World</option></select></div>
      <div className="city-list">{filtered.map(c => <button key={c.id} className={`city-row ${selected.id === c.id ? "active" : ""}`} onClick={() => setSelectedId(c.id)}>
        <span className="city-dot" style={{ "--dot": mode === "uv" ? "#fac66b" : mode === "anomaly" ? (modeValue(c) > 0 ? "#ff886d" : "#70b9e8") : "#6bd9c7" }} />
        <span className="city-names"><b>{c.ciudad}</b><small>{c.pais} · {c.altitud_m.toLocaleString()} m</small></span><strong>{fmt(data.ciudades[c.id]?.uv?.[monthIndex], 1)}</strong>
      </button>)}</div>
      <div className="sidebar-foot"><span>DATA SOURCE</span><b>NASA POWER · CERES SYN1deg</b><small>Monthly surface UV index</small></div>
    </aside>

    <section className="main-view" id="top">
      <div className="view-toolbar"><div className="mode-tabs">{MODES.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={mode === m.id ? "selected" : ""}>{m.label}</button>)}</div><button className={`link-toggle ${showLinks ? "on" : ""}`} onClick={() => setShowLinks(v => !v)}><span>⌁</span> Correlation links</button></div>
      <div className="globe-wrap">
        <EarthGlobe cities={filtered} links={showLinks ? links : []} mode={mode} selected={selected} monthIndex={monthIndex} onPick={id => setSelectedId(id)} />
        <div className="globe-caption"><span className="eyebrow">{MODES.find(m => m.id === mode)?.detail.toUpperCase()}</span><b>{mode === "trend" ? "SEN SLOPE · UV INDEX / YEAR" : mode === "anomaly" ? "STANDARDIZED ANOMALY · σ" : "UV INDEX · MONTHLY MEAN"}</b><small>NASA POWER · {date}</small></div>
        <div className={`map-legend ${mode}`}><b>{mode === "trend" ? "TREND DIRECTION" : mode === "anomaly" ? "ANOMALY" : mode === "season" ? "SEASONAL UV" : "UV INDEX"}</b><div className="legend-ramp"/><div className="legend-ends"><span>{mode === "anomaly" || mode === "trend" ? "LOW / NEGATIVE" : "LOW"}</span><span>{mode === "anomaly" || mode === "trend" ? "HIGH / POSITIVE" : "HIGH"}</span></div></div>
        <div className="globe-controls"><span>GLOBE</span><span>DRAG TO ROTATE&nbsp; · &nbsp;SCROLL TO ZOOM</span></div>
      </div>
      <div className="timeline">
        <div className="timeline-head"><span><b>TIME EXPLORER</b><small>Scrub the monthly record</small></span><strong>{date.replace("-", " / ")}</strong><button onClick={() => setMonthIndex((monthIndex + 1) % dates.length)} title="Next month">▶</button></div>
        <input aria-label="Select month" type="range" min="0" max={Math.max(0, dates.length - 1)} value={monthIndex} onChange={e => setMonthIndex(Number(e.target.value))}/>
        <div className="timeline-years"><span>2001</span><span>2005</span><span>2010</span><span>2015</span><span>2020</span><span>2024</span></div>
      </div>
    </section>

    <aside className="inspector">
      <div className="inspector-title"><span className="eyebrow">CITY PROFILE</span><button className="icon-button" onClick={() => navigator.clipboard?.writeText(`${selected.lat}, ${selected.lon}`)} title="Copy coordinates">↗</button></div>
      <div className="place"><span className="place-index">{String(cities.indexOf(selected) + 1).padStart(2, "0")} / {cities.length}</span><h2>{selected.ciudad}</h2><p>{selected.pais} <i>·</i> {selected.lat.toFixed(2)}° {selected.lat >= 0 ? "N" : "S"}, {Math.abs(selected.lon).toFixed(2)}° {selected.lon >= 0 ? "E" : "W"}</p><div className="place-tags"><span>LEVEL {selected.nivel}</span><span>{selected.altitud_m.toLocaleString()} M ELEVATION</span></div></div>
      <div className="metric-block"><div className="metric-label">UV INDEX <span>{date}</span></div><div className="metric"><b>{fmt(current, 2)}</b><span className="uv-badge">{current < 3 ? "LOW" : current < 6 ? "MODERATE" : current < 8 ? "HIGH" : "VERY HIGH"}</span></div><div className="metric-scale"><i style={{ width: `${Math.max(4, Math.min(100, current / 12 * 100))}%` }}/></div><small>Monthly mean · NASA POWER</small></div>
      <div className="chart-block"><div className="section-title"><span>LONG-TERM RECORD</span><small>2001—2024</small></div><Sparkline values={citySeries?.uv} /><div className="chart-axis"><span>2001</span><span>Monthly UV</span><span>2024</span></div></div>
      <div className="chart-block seasonal"><div className="section-title"><span>SEASONAL PROFILE</span><small>MONTHLY UV</small></div><SeasonChart values={selected.climatologia}/></div>
      <div className="stats-grid"><div><small>ANNUAL MEAN</small><b>{fmt(selected.uv_medio)}</b></div><div><small>PEAK MONTH</small><b>{selected.mes_pico}</b></div><div><small>LINEAR TREND</small><b>{selected.tendencia}</b></div><div><small>FDR SIGNIFICANCE</small><b className={selected.significativa_fdr ? "sig" : "muted"}>{selected.significativa_fdr ? "p < 0.05" : "Not significant"}</b></div></div>
      <div className="method-note"><span>i</span><p>Correlations describe shared variation; they do not establish causation. Grid resolution is approximately 1°.</p></div>
      <footer>EARTHSCOPE <span>·</span> NASA SPACE APPS CHALLENGE 2026</footer>
    </aside>
  </main>;
}
