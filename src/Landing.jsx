import { useState } from "react";
import EarthGlobe from "./components/EarthGlobe.jsx";
import "./landing.css";

const COPY = {
  en: {
    open: "Open the map",
    eyebrow: "SATELLITE UV · COLOMBIA & THE WORLD",
    tagline: "From space to your city.",
    intro: "Explore ultraviolet radiation patterns and long-term anomalies through a global, city-level view.",
    explore: "Explore the map",
    dataSource: "DATA SOURCE",
    authors: "PROJECT AUTHORS",
    role: "Physics student",
  },
  es: {
    open: "Explorar el mapa",
    eyebrow: "UV SATELITAL \u00b7 COLOMBIA Y EL MUNDO",
    tagline: "Del espacio a tu ciudad.",
    intro: "Explora los patrones de radiaci\u00f3n ultravioleta y sus anomal\u00edas de largo plazo desde una perspectiva global y local.",
    explore: "Explorar el mapa",
    dataSource: "FUENTE DE DATOS",
    authors: "AUTORES DEL PROYECTO",
    role: "Estudiante de f\u00edsica",
  },
};


function ProjectIcon() {
  return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><ellipse cx="20" cy="20" rx="7" ry="16"/><path d="M5 16h30M5 24h30M20 4v32"/></svg>;
}

export default function Landing() {
  const [language, setLanguage] = useState("en");
  const t = COPY[language];
  const years = "2001 — 2024";

  return <main className="landing" lang={language}>
    <header className="landing-header">
      <a className="landing-brand" href="#home" aria-label="EarthScope home"><ProjectIcon/><span>EarthScope</span></a>
      <div className="landing-actions"><label className="landing-language"><span className="sr-only">Language / Idioma</span><select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Language / Idioma"><option value="en">EN</option><option value="es">ES</option></select></label><a className="button button-small" href="/explorar">↗ <span>{t.open}</span><b>→</b></a></div>
    </header>

    <section className="landing-hero" id="home">
      <div className="hero-globe"><EarthGlobe cities={[]} mode="uv" monthIndex={0} onPick={() => {}} autoFocus={false}/></div>
      <div className="hero-stars" aria-hidden="true"/><div className="hero-copy"><span className="landing-eyebrow">{t.eyebrow}</span><h1>Earth<span>Scope</span></h1><h2>{t.tagline}</h2><i className="cyan-rule"/><p>{t.intro}</p><div className="hero-buttons"><a className="button" href="/explorar">▤ <span>{t.explore}</span> <b>→</b></a></div></div>
      <div className="hero-data-tag"><span className="pulse-dot"/> {t.dataSource}<b>NASA POWER</b><small>{years}</small></div>
      <aside className="author-panel" aria-label={t.authors}>
        <span className="author-heading">{t.authors}</span>
        <div className="author-entry"><span className="author-initials">DS</span><span><b>Daniel Santiago Salazar Epia</b><small>{t.role}</small></span></div>
        <div className="author-entry"><span className="author-initials">FC</span><span><b>Frank Darwin Chavez A</b><small>{t.role}</small></span></div>
      </aside>
    </section>
  </main>;
}
