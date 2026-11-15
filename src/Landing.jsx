import { useEffect, useMemo, useState } from "react";
import EarthGlobe from "./components/EarthGlobe.jsx";
import "./landing.css";

const COPY = {
  en: {
    navExplore: "Explore", navProject: "The project", navMethod: "Methodology", navData: "Data", navContact: "Contact", open: "Open the map",
    eyebrow: "SATELLITE UV · COLOMBIA & THE WORLD", tagline: "From space to your city.", intro: "Explore ultraviolet radiation patterns and long-term anomalies through a global, city-level view.", explore: "Explore the map", about: "Discover the project",
    problemKicker: "01 · THE BLIND SPOT", problemTitle: "A clearer view of", problemAccent: "UV exposure.", problemText: "Ground stations provide essential measurements, but they cover only a small part of the territory. Satellite data helps reveal how ultraviolet radiation varies across cities and regions.", problemNote: "A broader view helps put local conditions in context.", toolKicker: "02 · THE TOOL", toolTitle: "A new perspective on", toolAccent: "our changing world.", toolText: "EarthScope turns NASA POWER’s historical UV data into an interactive map. Explore cities, compare months and see how conditions change over time.", feature1: "Explore monthly UV by city", feature2: "Compare years and spot anomalies", feature3: "Move from global patterns to local context",
    dataSource: "DATA SOURCE", range: "RECORD", cities: "CITIES", chartKicker: "03 · METHODOLOGY", chartTitle: "From satellite data", chartAccent: "to anomalies.", chartText: "Monthly values are compared with each city’s historical climatology. Annual results are classified against that city’s long-term average and standard deviation.", methodFormula: "z-score", methodNote: "City-level historical comparison", applicationKicker: "04 · APPLICATION", applicationTitle: "Data science for", applicationAccent: "environmental insight.", applicationText: "EarthScope adds a spatial layer to environmental analysis, connecting UV variability with the places where people live.", next: "What’s next?", nextText: "Bring together UV and other environmental indicators to support a more complete view of exposure and risk.", footer: "Observe. Analyze. Understand.", mapLabel: "NASA POWER · UV INDEX", legend: "MONTHLY UV INDEX", low: "LOW", high: "HIGH", selected: "GLOBAL VIEW", openExplorer: "Open interactive explorer →",
  },
  es: {
    navExplore: "Explorar", navProject: "El proyecto", navMethod: "Metodología", navData: "Datos", navContact: "Contacto", open: "Explorar el mapa",
    eyebrow: "UV SATELITAL · COLOMBIA Y EL MUNDO", tagline: "Del espacio a tu ciudad.", intro: "Explora los patrones de radiación ultravioleta y sus anomalías de largo plazo desde una perspectiva global y local.", explore: "Explorar el mapa", about: "Conocer el proyecto",
    problemKicker: "01 · EL PUNTO CIEGO", problemTitle: "Una mirada más clara a la", problemAccent: "exposición UV.", problemText: "Las estaciones en tierra ofrecen mediciones esenciales, pero cubren una pequeña parte del territorio. Los datos satelitales ayudan a revelar cómo varía la radiación ultravioleta entre ciudades y regiones.", problemNote: "Una mirada amplia permite entender mejor las condiciones locales.", toolKicker: "02 · LA HERRAMIENTA", toolTitle: "Una nueva perspectiva del", toolAccent: "territorio.", toolText: "EarthScope transforma los datos históricos de UV de NASA POWER en un mapa interactivo. Explora ciudades, compara meses y observa cómo cambian las condiciones con el tiempo.", feature1: "Explora el UV mensual por ciudad", feature2: "Compara años e identifica anomalías", feature3: "Conecta patrones globales con el contexto local",
    dataSource: "FUENTE DE DATOS", range: "REGISTRO", cities: "CIUDADES", chartKicker: "03 · METODOLOGÍA", chartTitle: "De los datos satelitales", chartAccent: "a las anomalías.", chartText: "Los valores mensuales se comparan con la climatología histórica de cada ciudad. Los resultados anuales se clasifican frente al promedio de largo plazo y la desviación estándar de esa ciudad.", methodFormula: "z-score", methodNote: "Comparación histórica por ciudad", applicationKicker: "04 · APLICACIÓN", applicationTitle: "Ciencia de datos para el", applicationAccent: "análisis ambiental.", applicationText: "EarthScope agrega una capa espacial al análisis ambiental y conecta la variabilidad UV con los lugares donde vivimos.", next: "¿Qué sigue?", nextText: "Integrar el UV con otros indicadores ambientales para construir una perspectiva más completa de la exposición y el riesgo.", footer: "Observa. Analiza. Comprende.", mapLabel: "NASA POWER · ÍNDICE UV", legend: "ÍNDICE UV MENSUAL", low: "BAJO", high: "ALTO", selected: "VISTA GLOBAL", openExplorer: "Abrir explorador interactivo →",
  },
};

const COLORS = { above: "#ff896f", below: "#19b9eb", normal: "#70cbb2" };

function TrendChart({ series, language }) {
  const values = series?.anomalia_anual?.map(Number) ?? [];
  const years = series?.anios ?? [];
  if (!values.length) return null;
  const min = Math.min(-2, ...values), max = Math.max(2, ...values), x = i => 8 + i * 84 / Math.max(1, values.length - 1);
  const y = v => 62 - (v - min) / (max - min) * 48;
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return <svg className="landing-trend" viewBox="0 0 100 76" preserveAspectRatio="none" role="img" aria-label={language === "es" ? "Anomalía anual de radiación UV" : "Annual UV radiation anomaly"}>
    {[0, 1, 2, 3, 4].map(i => <line key={`h${i}`} x1="0" x2="100" y1={12 + i * 12} y2={12 + i * 12} className="trend-grid"/>)}
    <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="trend-zero"/>
    <polyline points={pts} fill="none" className="trend-line"/>
    {values.map((v, i) => <circle key={years[i]} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 1.7 : 1.1} fill={v > 1 ? COLORS.above : v < -1 ? COLORS.below : "#18c9f2"}/>)}
  </svg>;
}

function ProjectIcon() {
  return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><ellipse cx="20" cy="20" rx="7" ry="16"/><path d="M5 16h30M5 24h30M20 4v32"/></svg>;
}

export default function Landing() {
  const [language, setLanguage] = useState("en");
  const [data, setData] = useState(null);
  const t = COPY[language];
  useEffect(() => { fetch("/data/series_mensuales.json").then(r => r.json()).then(setData).catch(() => {}); }, []);
  const series = useMemo(() => data?.ciudades?.BOG ?? Object.values(data?.ciudades ?? {})[0], [data]);
  const years = data ? `${data.inicio.slice(0, 4)} — ${data.fin.slice(0, 4)}` : "2001 — 2024";
  const cityCount = data ? Object.keys(data.ciudades ?? {}).length : 100;

  return <main className="landing" lang={language}>
    <header className="landing-header">
      <a className="landing-brand" href="#home" aria-label="EarthScope home"><ProjectIcon/><span>EarthScope</span></a>
      <nav className="landing-nav"><a href="#explorer">{t.navExplore}</a><a href="#project">{t.navProject}</a><a href="#methodology">{t.navMethod}</a><a href="#data">{t.navData}</a><a href="#contact">{t.navContact}</a></nav>
      <div className="landing-actions"><label className="landing-language"><span className="sr-only">Language / Idioma</span><select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Language / Idioma"><option value="en">EN</option><option value="es">ES</option></select></label><a className="button button-small" href="/explorar">↗ <span>{t.open}</span><b>→</b></a><button className="menu-toggle" aria-label="Open menu">☰</button></div>
    </header>

    <section className="landing-hero" id="home">
      <div className="hero-globe"><EarthGlobe cities={[]} mode="uv" monthIndex={0} onPick={() => {}} autoFocus={false}/></div>
      <div className="hero-stars" aria-hidden="true"/><div className="hero-copy"><span className="landing-eyebrow">{t.eyebrow}</span><h1>Earth<span>Scope</span></h1><h2>{t.tagline}</h2><i className="cyan-rule"/><p>{t.intro}</p><div className="hero-buttons"><a className="button" href="/explorar">▤ <span>{t.explore}</span> <b>→</b></a><a className="button button-outline" href="#project">ⓘ <span>{t.about}</span></a></div></div>
      <div className="hero-data-tag"><span className="pulse-dot"/> {t.dataSource}<b>NASA POWER</b><small>{years}</small></div>
      <a href="#project" className="scroll-cue" aria-label="Scroll to project"><span/>SCROLL TO EXPLORE</a>
    </section>

    <section className="problem-section" id="project">
      <div className="problem-image"><div className="problem-satellite"><EarthGlobe cities={[]} mode="uv" monthIndex={0} onPick={() => {}} autoFocus={false} initialView={[-73, 4.5, 3100000]}/></div><div className="satellite-wash"/><div className="problem-image-caption">{t.selected} <b>06°N · 73°W</b></div></div>
      <div className="problem-copy"><span className="landing-eyebrow">{t.problemKicker}<i/></span><h2>{t.problemTitle}<br/><em>{t.problemAccent}</em></h2><p>{t.problemText}</p><p className="soft-copy">{t.problemNote}</p>
        <div className="stat-card"><span className="stat-icon">⌖</span><div><small>{t.range}</small><b>{years}</b><small>NASA POWER · MONTHLY UV</small></div><i className="stat-line"/></div>
      </div>
    </section>

    <section className="tool-section" id="explorer">
      <div className="tool-copy"><span className="landing-eyebrow">{t.toolKicker}<i/></span><h2>{t.toolTitle}<br/><em>{t.toolAccent}</em></h2><p>{t.toolText}</p><ul><li>{t.feature1}</li><li>{t.feature2}</li><li>{t.feature3}</li></ul><a className="text-link" href="/explorar">{t.openExplorer}</a></div>
      <a className="map-preview" href="/explorar" aria-label={t.openExplorer}>
        <div className="preview-top"><span className="nasa-mark">NASA</span><b>{t.mapLabel}</b><span className="preview-period">{years}　⌄</span><span className="preview-cities">{t.cities}: {cityCount}　⌄</span></div>
        <div className="preview-earth"><div className="preview-grid"/><div className="uv-swath"/><div className="preview-map-label"><span className="map-pin">●</span><b>Bogotá</b><small>{language === "es" ? "Índice UV" : "UV Index"}</small><strong>{series?.uv_anual?.at(-1)?.toFixed(1) ?? "—"}</strong><div className="uv-gradient"/><small>{language === "es" ? "ANOMALÍA ANUAL" : "ANNUAL ANOMALY"}</small><b className="anomaly-value">{series?.anomalia_anual?.at(-1) > 0 ? "+" : ""}{series?.anomalia_anual?.at(-1)?.toFixed(2) ?? "—"}</b></div><div className="map-legend-card"><small>{t.legend}</small><div className="uv-gradient"/><div><span>{t.low}</span><span>{t.high}</span></div></div><span className="preview-zoom">＋<br/>−</span></div>
        <div className="preview-credit">Esri satellite imagery · CesiumJS</div>
      </a>
    </section>

    <section className="method-section" id="methodology">
      <div className="chart-card" id="data"><div className="chart-card-head"><span className="pulse-dot"/>{language === "es" ? "ANOMALÍAS UV · BOGOTÁ" : "UV ANOMALIES · BOGOTÁ"}<small>NASA POWER</small></div><TrendChart series={series} language={language}/><div className="chart-years"><span>{series?.anios?.[0] ?? "2001"}</span><span>{series?.anios?.at(-1) ?? "2024"}</span></div><div className="chart-callout">{language === "es" ? "Serie histórica" : "Historical series"}<b>{years}</b></div></div>
      <div className="method-copy"><span className="landing-eyebrow">{t.chartKicker}</span><h2>{t.chartTitle}<br/><em>{t.chartAccent}</em></h2><p>{t.chartText}</p><div className="formula-card"><span>z</span><b>{t.methodFormula}</b><small>{t.methodNote}</small><i>μ · σ</i></div></div>
    </section>

    <section className="application-section"><div className="application-bg"/><div className="application-copy"><span className="landing-eyebrow">{t.applicationKicker}<i/></span><h2>{t.applicationTitle}<br/><em>{t.applicationAccent}</em></h2><p>{t.applicationText}</p></div><div className="next-card"><span className="leaf">✦</span><h3>{t.next}</h3><p>{t.nextText}</p><a href="/explorar" aria-label={t.openExplorer}>→</a></div></section>

    <footer className="landing-footer" id="contact"><a className="landing-brand" href="#home"><ProjectIcon/><span>EarthScope<small>{t.footer}</small></span></a><nav><a href="#project">{t.navProject}</a><i/><a href="#data">{t.navData}</a><i/><a href="#methodology">{t.navMethod}</a><i/><a href="/explorar">{t.navExplore}</a></nav><div className="footer-sources"><span>NASA POWER</span><span>CESIUMJS</span><span>Esri World Imagery</span></div></footer>
  </main>;
}
