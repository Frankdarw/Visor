import { useEffect, useMemo, useState } from "react";
import EarthGlobe from "./components/EarthGlobe.jsx";
import "./analysis.css";

const COPY = {
  en: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    classes: { above: "Above average", below: "Below average", normal: "Normal" },
    annualEmpty: "No annual data", annualChart: "Annual average UV index and anomalies", averageUV: "Annual average · UV",
    loadError: "Could not load the data.", loadHint: "Run python analizar_ciudades.py to generate files in public/data.", loading: "Loading data…",
    record: "RECORD", cities: "CITIES", annualAnomalies: "ANNUAL AVERAGES & ANOMALIES", observatory: "GLOBAL OBSERVATORY",
    headlineA: "Explore the", headlineB: "UV signal.", intro: "Compare UV radiation and its annual variations by city.", search: "Search city…",
    all: "All", colombia: "Colombia", southAmerica: "South America", world: "World", source: "DATA SOURCE", monthlyUV: "Monthly UV index",
    uv: "UV index", anomalies: "Anomalies", monthlyUVCaption: "MONTHLY UV INDEX", anomalyCaption: "DEVIATION FROM MONTHLY CLIMATOLOGY",
    anomalyUnits: "ANOMALIES IN STANDARD DEVIATION UNITS", classification: "CLASSIFICATION", low: "LOW", high: "HIGH",
    globe: "GLOBE", globeHelp: "DRAG TO ROTATE · SCROLL TO ZOOM", monthlyPeriod: "MONTHLY PERIOD", chooseDate: "Choose a date", nextMonth: "Next month",
    chooseMonth: "Select month", cityProfile: "CITY PROFILE", copyCoordinates: "Copy coordinates", monthly: "MONTHLY UV", altitude: "m elevation",
    uvIndex: "UV INDEX", anomalyClass: "Monthly anomaly classification · NASA POWER", uvByYear: "UV INDEX BY YEAR", years: "years",
    method: "Each annual average is compared with the city average. Above and below indicate deviations greater than one standard deviation; the rest are classified as normal.",
  },
  es: {
    months: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
    classes: { above: "Por encima", below: "Por debajo", normal: "Normal" },
    annualEmpty: "No hay datos anuales", annualChart: "Promedio anual del índice UV y anomalías", averageUV: "Promedio anual · UV",
    loadError: "No se pudieron cargar los datos.", loadHint: "Ejecuta python analizar_ciudades.py para generarlos en public/data.", loading: "Cargando datos…",
    record: "REGISTRO", cities: "CIUDADES", annualAnomalies: "PROMEDIOS ANUALES Y ANOMALÍAS", observatory: "OBSERVATORIO GLOBAL",
    headlineA: "Explora la", headlineB: "señal UV.", intro: "Compara la radiación UV y sus variaciones anuales por ciudad.", search: "Buscar ciudad…",
    all: "Todas", colombia: "Colombia", southAmerica: "Sudamérica", world: "Mundo", source: "FUENTE DE DATOS", monthlyUV: "Índice UV mensual",
    uv: "Índice UV", anomalies: "Anomalías", monthlyUVCaption: "ÍNDICE UV MENSUAL", anomalyCaption: "DESVIACIÓN DE LA CLIMATOLOGÍA MENSUAL",
    anomalyUnits: "ANOMALÍAS EN UNIDADES DE DESVIACIÓN ESTÁNDAR", classification: "CLASIFICACIÓN", low: "BAJO", high: "ALTO",
    globe: "GLOBO", globeHelp: "ARRASTRA PARA GIRAR · RUEDA PARA ACERCAR", monthlyPeriod: "PERIODO MENSUAL", chooseDate: "Selecciona una fecha", nextMonth: "Mes siguiente",
    chooseMonth: "Seleccionar mes", cityProfile: "PERFIL DE CIUDAD", copyCoordinates: "Copiar coordenadas", monthly: "UV MENSUAL", altitude: "m de altitud",
    uvIndex: "ÍNDICE UV", anomalyClass: "Clasificación de la anomalía mensual · NASA POWER", uvByYear: "ÍNDICE UV POR AÑO", years: "años",
    method: "Cada promedio anual se compara con el promedio de la ciudad. Por encima y por debajo indican desviaciones mayores a una desviación estándar; el resto se clasifica como normal.",
  },
};

const CLASS_COLOR = { above: "#ff896f", below: "#1412ac", normal: "#70cbb2" };
const classify = value => value > 1 ? "above" : value < -1 ? "below" : "normal";
const fmt = (value, digits = 2) => value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";

function AnnualChart({ series, t }) {
  const years = series?.anios ?? [];
  const values = series?.uv_anual?.map(Number) ?? [];
  if (!years.length) return <div className="chart-empty">{t.annualEmpty}</div>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = i => 5 + 90 * i / Math.max(1, values.length - 1);
  const y = value => 82 - (value - min) / span * 70;
  const points = values.map((value, i) => `${x(i)},${y(value)}`).join(" ");
  const mean = Number(series.promedio_anual);
  const meanY = y(Math.max(min, Math.min(max, mean)));
  return <div className="annual-chart-wrap">
    <svg className="annual-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t.annualChart}>
      {[25, 50, 75].map(line => <line key={line} x1="0" x2="100" y1={line} y2={line} className="grid-line" />)}
      <line x1="0" x2="100" y1={meanY} y2={meanY} className="annual-mean-line" />
      <polyline points={points} fill="none" stroke="#d0ded9" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {values.map((value, i) => <circle key={years[i]} cx={x(i)} cy={y(value)} r="2.1" fill={CLASS_COLOR[series.clasificacion_anual?.[i]] ?? CLASS_COLOR.normal} />)}
    </svg>
    <div className="chart-axis"><span>{years[0]}</span><span>{t.averageUV}</span><span>{years.at(-1)}</span></div>
  </div>;
}

export default function App() {
  const [data, setData] = useState(null);
  const [features, setFeatures] = useState([]);
  const [monthIndex, setMonthIndex] = useState(0);
  const [selectedId, setSelectedId] = useState("NEI");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [mode, setMode] = useState("uv");
  const [language, setLanguage] = useState("en");
  const t = COPY[language];

  useEffect(() => {
    Promise.all([
      fetch("/data/series_mensuales.json").then(response => { if (!response.ok) throw Error("series"); return response.json(); }),
      fetch("/data/prisma_ciudades.geojson").then(response => { if (!response.ok) throw Error("cities"); return response.json(); }),
    ]).then(([series, cityGeo]) => {
      setData(series);
      setFeatures(cityGeo.features);
      setMonthIndex(series.fechas.length - 1);
    }).catch(() => setData({ error: true }));
  }, []);

  const dates = data?.fechas ?? [];
  const cities = useMemo(() => features.map(feature => {
    const props = feature.properties;
    const citySeries = data?.ciudades?.[props.city_id];
    return { ...props, id: props.city_id, lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0], _uv: citySeries?.uv?.[monthIndex], _z: citySeries?.z?.[monthIndex] };
  }), [features, data, monthIndex]);
  const filtered = useMemo(() => cities.filter(city =>
    (region === "all" || String(city.nivel) === region) && `${city.ciudad} ${city.pais} ${city.city_id}`.toLowerCase().includes(query.toLowerCase())), [cities, region, query]);
  const selected = cities.find(city => city.id === selectedId) ?? cities[0];
  const selectedSeries = selected && data?.ciudades?.[selected.id];
  const date = dates[monthIndex] ?? "";
  const categoryCounts = useMemo(() => (selectedSeries?.clasificacion_anual ?? []).reduce((counts, category) => ({ ...counts, [category]: (counts[category] ?? 0) + 1 }), {}), [selectedSeries]);
  const cityCount = (label, english) => language === "en" ? english : label;

  if (data?.error) return <main className="load-error"><b>{t.loadError}</b><p>{t.loadHint}</p></main>;
  if (!data || !selected) return <main className="loading"><span className="orbit" />{t.loading}</main>;

  return <main className="workspace">
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark">P</span><span><b>PRISMA</b><small>EARTH OBSERVATION &amp; DATA SCIENCE</small></span></a>
      <div className="top-meta"><span className="live-dot" /> {t.record} <b>{data.inicio.slice(0, 4)}—{data.fin.slice(0, 4)}</b><i /> {t.cities} <b>{cities.length}</b></div>
      <span className="eyebrow top-eyebrow">{t.annualAnomalies}</span>
      <label className="language-picker"><span className="sr-only">Language / Idioma</span><select value={language} onChange={event => setLanguage(event.target.value)} aria-label="Language / Idioma"><option value="en">EN</option><option value="es">ES</option></select></label>
    </header>

    <aside className="sidebar">
      <div className="side-heading"><span className="eyebrow">{t.observatory}</span><h1>{t.headlineA}<br/><em>{t.headlineB}</em></h1><p>{t.intro}</p></div>
      <label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search}/><kbd>/</kbd></label>
      <div className="filter-row"><span>{t.cities} <b>{filtered.length}</b></span><select value={region} onChange={event => setRegion(event.target.value)}><option value="all">{t.all}</option><option value="1">{t.colombia}</option><option value="2">{t.southAmerica}</option><option value="3">{t.world}</option></select></div>
      <div className="city-list">{filtered.map(city => <button key={city.id} className={`city-row ${selected.id === city.id ? "active" : ""}`} onClick={() => setSelectedId(city.id)}>
        <span className="city-dot" style={{ "--dot": mode === "uv" ? "#fac66b" : CLASS_COLOR[classify(city._z ?? 0)] }} />
        <span className="city-names"><b>{city.ciudad}</b><small>{city.pais} · {Number(city.altitud_m ?? 0).toLocaleString()} m</small></span><strong>{fmt(city._uv, 1)}</strong>
      </button>)}</div>
      <div className="sidebar-foot"><span>{t.source}</span><b>NASA POWER</b><small>{t.monthlyUV}</small></div>
    </aside>

    <section className="main-view" id="top">
      <div className="view-toolbar"><div className="mode-tabs">{[{ id: "uv", label: t.uv }, { id: "anomaly", label: t.anomalies }].map(item => <button key={item.id} onClick={() => setMode(item.id)} className={mode === item.id ? "selected" : ""}>{item.label}</button>)}</div>
        {mode === "anomaly" && <div className="classification-legend">{Object.entries(t.classes).map(([key, label]) => <span key={key}><i style={{ background: CLASS_COLOR[key] }}/>{label}</span>)}</div>}
      </div>
      <div className="globe-wrap">
        <EarthGlobe cities={filtered} mode={mode} selected={selected} monthIndex={monthIndex} onPick={setSelectedId} />
        <div className="globe-caption"><span className="eyebrow">{mode === "uv" ? t.monthlyUVCaption : t.anomalyCaption}</span><b>{date}</b><small>NASA POWER · {mode === "anomaly" ? t.anomalyUnits : "ALLSKY_SFC_UV_INDEX"}</small></div>
        <div className="map-legend"><b>{mode === "anomaly" ? t.classification : t.uv.toUpperCase()}</b>{mode === "anomaly" ? <div className="map-class-list">{Object.entries(t.classes).map(([key, label]) => <span key={key}><i style={{ background: CLASS_COLOR[key] }}/>{label}</span>)}</div> : <><div className="legend-ramp"/><div className="legend-ends"><span>{t.low}</span><span>{t.high}</span></div></>}</div>
        <div className="globe-controls"><span>{t.globe}</span><span>{t.globeHelp}</span></div>
      </div>
      <div className="timeline"><div className="timeline-head"><span><b>{t.monthlyPeriod}</b><small>{t.chooseDate}</small></span><strong>{date}</strong><button onClick={() => setMonthIndex((monthIndex + 1) % dates.length)} title={t.nextMonth}>▶</button></div>
        <input aria-label={t.chooseMonth} type="range" min="0" max={Math.max(0, dates.length - 1)} value={monthIndex} onChange={event => setMonthIndex(Number(event.target.value))}/>
        <div className="timeline-years"><span>{data.inicio.slice(0, 4)}</span><span>{data.fin.slice(0, 4)}</span></div>
      </div>
    </section>

    <aside className="inspector">
      <div className="inspector-title"><span className="eyebrow">{t.cityProfile}</span><button className="icon-button" onClick={() => navigator.clipboard?.writeText(`${selected.lat}, ${selected.lon}`)} title={t.copyCoordinates}>↗</button></div>
      <div className="place"><span className="place-index">{String(cities.indexOf(selected) + 1).padStart(2, "0")} / {cities.length}</span><h2>{selected.ciudad}</h2><p>{selected.pais} <i>·</i> {selected.lat.toFixed(2)}°, {selected.lon.toFixed(2)}°</p><div className="place-tags"><span>{t.monthly}</span><span>{Number(selected.altitud_m ?? 0).toLocaleString()} M {t.altitude.toUpperCase()}</span></div></div>
      <div className="metric-block"><div className="metric-label">{t.uvIndex} <span>{date}</span></div><div className="metric"><b>{fmt(selectedSeries?.uv?.[monthIndex])}</b><span className="uv-badge">{t.classes[classify(selectedSeries?.z?.[monthIndex] ?? 0)].toUpperCase()}</span></div><div className="metric-scale"><i style={{ width: `${Math.max(4, Math.min(100, (selectedSeries?.uv?.[monthIndex] ?? 0) / 12 * 100))}%` }}/></div><small>{t.anomalyClass}</small></div>
      <div className="chart-block"><div className="section-title"><span>{t.uvByYear}</span><small>{data.inicio.slice(0, 4)}—{data.fin.slice(0, 4)}</small></div><AnnualChart series={selectedSeries} t={t}/></div>
      <div className="stats-grid annual-classes">{Object.entries(t.classes).map(([key, label]) => <div key={key}><small><i style={{ background: CLASS_COLOR[key] }}/>{label.toUpperCase()}</small><b>{categoryCounts[key] ?? 0} {t.years}</b></div>)}</div>
      <div className="method-note"><span>i</span><p>{t.method}</p></div>
      <footer>PRISMA <span>·</span> NASA POWER</footer>
    </aside>
  </main>;
}
