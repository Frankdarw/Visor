"""
EarthScope - Análisis de radiación UV para todas las ciudades (2001-2024)
Datos fuente: NASA POWER (ALLSKY_SFC_UV_INDEX), descargados con descargar_power.py

Generaliza el análisis de Neiva a todo el catálogo y deja los resultados listos
para el visualizador (CesiumJS).

Uso:
    python analizar_ciudades.py
    python analizar_ciudades.py --entrada datos_power --ciudades ciudades.csv --salida resultados
    python analizar_ciudades.py --inicio 2001 --fin 2024 --k 4 --sin-graficas

Salidas (en --salida):
    resumen_ciudades.csv          una fila por ciudad: promedio, amplitud, tendencia, p, IC, cluster...
    climatologia.csv              perfil mensual (12 valores) por ciudad
    promedios_anuales.csv         promedio anual, anomalía y tipo (Alto/Bajo/Normal) por ciudad y año
    anomalias_mensuales.csv       anomalía y anomalía estandarizada (Z) por ciudad y mes
    correlaciones_anomalias.csv   matriz de correlación (Pearson) entre ciudades, sobre Z
    earthscope_ciudades.geojson   puntos con todas las propiedades -> CesiumJS (GeoJsonDataSource)
    conexiones.geojson            arcos entre ciudades con anomalías correlacionadas
    series_mensuales.json         series mensuales (UV y Z) por ciudad, para el control de tiempo
    graficas/                     las dos gráficas originales, una pareja por ciudad
"""

import argparse
import json
import math
import sys
import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # sin ventanas: guarda PNG directamente
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import fcluster, linkage

warnings.filterwarnings("ignore")

MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
         "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MES_NUM = {m: i + 1 for i, m in enumerate(MESES)}
MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]


# ============================================================================
# 1. CARGA Y FILTRADO (misma lógica que el análisis de Neiva)
# ============================================================================

def leer_ciudad(ruta, inicio, fin):
    """Lee un CSV de NASA POWER y devuelve los años completos entre inicio y fin."""
    with open(ruta, "r", encoding="utf-8") as f:
        lineas = f.readlines()
    inicio_datos = next(i for i, l in enumerate(lineas)
                        if "PARAMETER,YEAR,JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC" in l)
    df = pd.read_csv(ruta, skiprows=inicio_datos)
    df = df[df["PARAMETER"] == "ALLSKY_SFC_UV_INDEX"].copy()
    df = df[(df["YEAR"] >= inicio) & (df["YEAR"] <= fin)]
    n_antes = len(df)
    for mes in MESES:                      # un año con algún -999 se descarta completo
        df = df[df[mes] != -999.0]
    return df, n_antes - len(df)


def a_largo(df_ancho):
    largo = pd.melt(df_ancho, id_vars=["YEAR"], value_vars=MESES,
                    var_name="MES", value_name="UV_INDEX")
    largo["MES_NUM"] = largo["MES"].map(MES_NUM)
    return largo.sort_values(["YEAR", "MES_NUM"]).reset_index(drop=True)


# ============================================================================
# 2. ANÁLISIS DE UNA CIUDAD
# ============================================================================

def analizar_ciudad(df_ancho, descartados, meta):
    largo = a_largo(df_ancho)

    # Promedios anuales y años anómalos (±1σ, como en el análisis de Neiva)
    anual = largo.groupby("YEAR")["UV_INDEX"].mean().reset_index()
    anual.columns = ["AÑO", "PROMEDIO_ANUAL"]
    media = anual["PROMEDIO_ANUAL"].mean()
    std = anual["PROMEDIO_ANUAL"].std()
    anual["ANOMALIA"] = anual["PROMEDIO_ANUAL"] - media
    anual["TIPO"] = "Normal"
    anual.loc[anual["ANOMALIA"] > std, "TIPO"] = "Alto"
    anual.loc[anual["ANOMALIA"] < -std, "TIPO"] = "Bajo"

    # Climatología mensual y anomalías mensuales
    clim = largo.groupby("MES_NUM")["UV_INDEX"].mean()
    sigma = largo.groupby("MES_NUM")["UV_INDEX"].std()
    largo["CLIM"] = largo["MES_NUM"].map(clim)
    largo["ANOM"] = largo["UV_INDEX"] - largo["CLIM"]
    largo["Z"] = largo["ANOM"] / largo["MES_NUM"].map(sigma).replace(0, np.nan)

    # Tendencia: regresión lineal sobre promedios anuales (como en Neiva) + Kendall + Theil-Sen
    x, y = anual["AÑO"].values, anual["PROMEDIO_ANUAL"].values
    n = len(x)
    res = dict(meta)
    res.update(n_anios=n, anios_descartados=int(descartados),
               uv_medio=media, uv_std_anual=std,
               uv_max_mes=float(clim.max()), uv_min_mes=float(clim.min()),
               amplitud_estacional=float(clim.max() - clim.min()),
               mes_pico=MESES_ES[int(clim.idxmax()) - 1],
               mes_valle=MESES_ES[int(clim.idxmin()) - 1])
    if n >= 4:
        lr = stats.linregress(x, y)
        t = stats.t.ppf(0.975, n - 2)
        tau, p_tau = stats.kendalltau(x, y)
        sen = stats.theilslopes(y, x)
        res.update(pendiente=lr.slope, p_valor=lr.pvalue, r2=lr.rvalue ** 2,
                   ic95_inf=lr.slope - t * lr.stderr, ic95_sup=lr.slope + t * lr.stderr,
                   kendall_tau=tau, kendall_p=p_tau, sen_pendiente=sen[0],
                   cambio_total_periodo=lr.slope * (x.max() - x.min()))
    else:
        res.update(pendiente=np.nan, p_valor=np.nan, r2=np.nan, ic95_inf=np.nan,
                   ic95_sup=np.nan, kendall_tau=np.nan, kendall_p=np.nan,
                   sen_pendiente=np.nan, cambio_total_periodo=np.nan)
    return res, largo, anual, clim


def fdr_bh(p):
    """Corrección de Benjamini-Hochberg para pruebas múltiples (muchas ciudades)."""
    p = np.asarray(p, float)
    out = np.full_like(p, np.nan)
    ok = ~np.isnan(p)
    pv = p[ok]
    if len(pv) == 0:
        return out
    orden = np.argsort(pv)
    ajust = pv[orden] * len(pv) / np.arange(1, len(pv) + 1)
    ajust = np.minimum.accumulate(ajust[::-1])[::-1]
    tmp = np.empty(len(pv))
    tmp[orden] = np.minimum(ajust, 1)
    out[ok] = tmp
    return out


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2 +
         math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(a))


# ============================================================================
# 3. GRÁFICAS POR CIUDAD (las dos del análisis de Neiva)
# ============================================================================

def graficas_ciudad(carpeta, cid, nombre, largo, anual, clim, res, dpi):
    try:
        plt.style.use("seaborn-v0_8-darkgrid")
    except OSError:
        pass
    media = anual["PROMEDIO_ANUAL"].mean()
    x, y = anual["AÑO"].values, anual["PROMEDIO_ANUAL"].values

    # --- Tendencia anual ---
    fig, ax = plt.subplots(figsize=(14, 7))
    ax.plot(largo["YEAR"] + (largo["MES_NUM"] - 0.5) / 12, largo["UV_INDEX"],
            color="lightgray", linewidth=0.5, alpha=0.7, label="Datos mensuales")
    std_m = largo.groupby("YEAR")["UV_INDEX"].std().reindex(anual["AÑO"]).values
    ax.errorbar(x, y, yerr=std_m, fmt="o", capsize=5, markersize=7, color="black",
                ecolor="gray", alpha=0.8, label="Promedio anual ± 1σ")
    altos, bajos = anual[anual["TIPO"] == "Alto"], anual[anual["TIPO"] == "Bajo"]
    ax.scatter(altos["AÑO"], altos["PROMEDIO_ANUAL"], color="red", s=130, zorder=5,
               edgecolors="darkred", linewidth=2, label="Años anómalamente altos")
    ax.scatter(bajos["AÑO"], bajos["PROMEDIO_ANUAL"], color="green", s=130, zorder=5,
               edgecolors="darkgreen", linewidth=2, label="Años anómalamente bajos")
    if not np.isnan(res["pendiente"]):
        lr = stats.linregress(x, y)
        ax.plot(x, lr.slope * x + lr.intercept, "r--", linewidth=2,
                label=f"Tendencia: {res['pendiente']:.5f} UVI/año (p={res['p_valor']:.3f})")
    ax.axhline(media, color="blue", linestyle=":", linewidth=1.5,
               label=f"Promedio total: {media:.3f}")
    ax.set_xticks(x[::2])
    ax.set_xlim(x.min() - 0.5, x.max() + 0.5)
    ax.set_xlabel("Año")
    ax.set_ylabel("Índice UV (ALLSKY_SFC_UV_INDEX)")
    ax.set_title(f"Variación de la radiación UV en {nombre} ({int(x.min())}-{int(x.max())})\n"
                 "Datos NASA POWER", fontweight="bold")
    ax.legend(loc="upper right", fontsize=9)
    plt.tight_layout()
    plt.savefig(carpeta / f"{cid}_tendencia_anual.png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    # --- Estacionalidad ---
    fig2, ax2 = plt.subplots(figsize=(12, 6))
    sd = largo.groupby("MES_NUM")["UV_INDEX"].std()
    ax2.bar(MESES_ES, clim.values, yerr=sd.values, capsize=5, color="skyblue",
            edgecolor="navy", alpha=0.7)
    ax2.axhline(media, color="red", linestyle="--", label=f"Promedio anual: {media:.3f}")
    ax2.set_xlabel("Mes")
    ax2.set_ylabel("Índice UV promedio")
    ax2.set_title(f"Ciclo estacional de la radiación UV en {nombre}", fontweight="bold")
    ax2.tick_params(axis="x", rotation=45)
    ax2.legend()
    plt.tight_layout()
    plt.savefig(carpeta / f"{cid}_estacionalidad.png", dpi=dpi, bbox_inches="tight")
    plt.close(fig2)


# ============================================================================
# 4. EXPORTACIÓN PARA CESIUM
# ============================================================================

def limpio(o):
    """Convierte NaN/numpy a tipos JSON válidos (NaN -> null) y redondea."""
    if isinstance(o, dict):
        return {k: limpio(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, np.ndarray)):
        return [limpio(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if (math.isnan(o) or math.isinf(o)) else round(float(o), 5)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def main():
    ap = argparse.ArgumentParser(description="Análisis UV de todas las ciudades")
    ap.add_argument("--entrada", default="datos_power", help="Carpeta con <city_id>.csv")
    ap.add_argument("--ciudades", default="ciudades.csv")
    ap.add_argument("--salida", default="resultados")
    ap.add_argument("--inicio", type=int, default=2001)
    ap.add_argument("--fin", type=int, default=2024)
    ap.add_argument("--k", type=int, default=4, help="Número de grupos estacionales")
    ap.add_argument("--min-anios", type=int, default=10, help="Mínimo de años completos por ciudad")
    ap.add_argument("--conexiones-por-ciudad", type=int, default=3)
    ap.add_argument("--umbral-r", type=float, default=0.5, help="Correlación mínima para dibujar un arco")
    ap.add_argument("--sin-graficas", action="store_true")
    ap.add_argument("--dpi", type=int, default=150)
    args = ap.parse_args()

    entrada, salida = Path(args.entrada), Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    carpeta_graf = salida / "graficas"
    if not args.sin_graficas:
        carpeta_graf.mkdir(exist_ok=True)

    ciudades = pd.read_csv(args.ciudades)
    for col in ("city_id", "lat", "lon"):
        if col not in ciudades.columns:
            sys.exit(f"Falta la columna '{col}' en {args.ciudades}")
    if "ciudad" not in ciudades.columns:
        ciudades["ciudad"] = ciudades["city_id"]

    # ------------------------------------------------------------------ bucle
    resumenes, largos, anuales, climas = [], [], [], {}
    for _, c in ciudades.iterrows():
        cid = c["city_id"]
        ruta = entrada / f"{cid}.csv"
        if not ruta.exists():
            print(f"  [salta] {cid}: no existe {ruta}")
            continue
        try:
            ancho, descartados = leer_ciudad(ruta, args.inicio, args.fin)
            if len(ancho) < args.min_anios:
                print(f"  [salta] {cid}: solo {len(ancho)} años completos (mínimo {args.min_anios})")
                continue
            meta = {k: (v.item() if hasattr(v, "item") else v) for k, v in c.items()}
            res, largo, anual, clim = analizar_ciudad(ancho, descartados, meta)
        except Exception as e:
            print(f"  [error] {cid}: {e}")
            continue
        largo["city_id"], anual["city_id"] = cid, cid
        resumenes.append(res)
        largos.append(largo)
        anuales.append(anual)
        climas[cid] = clim
        if not args.sin_graficas:
            graficas_ciudad(carpeta_graf, cid, c["ciudad"], largo, anual, clim, res, args.dpi)
        print(f"  [ok] {cid:<6} {c['ciudad']:<20} años={res['n_anios']:>2}  "
              f"UV medio={res['uv_medio']:.2f}  tendencia={res['pendiente']:+.5f}/año")

    if not resumenes:
        sys.exit("No se pudo analizar ninguna ciudad. Revisa --entrada y --ciudades.")

    res_df = pd.DataFrame(resumenes)

    # -------------------------------------------- pruebas múltiples y tendencia
    res_df["p_fdr"] = fdr_bh(res_df["p_valor"].values)
    res_df["significativa_p05"] = res_df["p_valor"] < 0.05
    res_df["significativa_fdr"] = res_df["p_fdr"] < 0.05
    res_df["tendencia"] = np.where(
        res_df["significativa_fdr"],
        np.where(res_df["pendiente"] > 0, "creciente", "decreciente"),
        "sin tendencia significativa")

    # ----------------------------------------------- celdas compartidas (1° x 1°)
    res_df["celda_lat"] = np.floor(res_df["lat"]) + 0.5
    res_df["celda_lon"] = np.floor(res_df["lon"]) + 0.5
    res_df["misma_celda"] = res_df.duplicated(["celda_lat", "celda_lon"], keep=False)

    # ------------------------------------- Investigación A: huellas estacionales
    clim_df = pd.DataFrame(climas).T
    clim_df.columns = [f"M{m:02d}" for m in clim_df.columns]
    perfil_z = clim_df.sub(clim_df.mean(axis=1), axis=0).div(clim_df.std(axis=1), axis=0)
    n_ciudades = len(res_df)
    if n_ciudades >= 3:
        k = max(2, min(args.k, n_ciudades - 1))
        grupos = fcluster(linkage(perfil_z.values, method="ward"), t=k, criterion="maxclust")
        res_df["cluster_estacional"] = pd.Series(grupos, index=perfil_z.index).reindex(res_df["city_id"]).values
    else:
        res_df["cluster_estacional"] = np.nan
        print("  Aviso: hay menos de 3 ciudades, no se calculan grupos estacionales.")

    # ------------------------------------------ Investigación B: anomalías (Z)
    largo_all = pd.concat(largos, ignore_index=True)
    largo_all["FECHA"] = pd.to_datetime(dict(year=largo_all["YEAR"],
                                             month=largo_all["MES_NUM"], day=1))
    z_wide = largo_all.pivot(index="FECHA", columns="city_id", values="Z")
    corr = z_wide.corr(method="pearson", min_periods=60)

    # Arcos: top-K correlaciones positivas por ciudad (sin pares de la misma celda)
    info = res_df.set_index("city_id")
    pares = {}
    for a in corr.index:
        cand = corr.loc[a].drop(a).dropna().sort_values(ascending=False)
        n_ok = 0
        for b, r in cand.items():
            if r < args.umbral_r or n_ok >= args.conexiones_por_ciudad:
                break
            if (info.loc[a, "celda_lat"], info.loc[a, "celda_lon"]) == \
               (info.loc[b, "celda_lat"], info.loc[b, "celda_lon"]):
                continue  # misma celda: la correlación sería trivial
            pares[tuple(sorted((a, b)))] = float(r)
            n_ok += 1
    features_con = []
    for (a, b), r in pares.items():
        features_con.append({
            "type": "Feature",
            "geometry": {"type": "LineString",
                         "coordinates": [[info.loc[a, "lon"], info.loc[a, "lat"]],
                                         [info.loc[b, "lon"], info.loc[b, "lat"]]]},
            "properties": {"a": a, "b": b, "r": r,
                           "distancia_km": haversine(info.loc[a, "lat"], info.loc[a, "lon"],
                                                     info.loc[b, "lat"], info.loc[b, "lon"])}})

    # ----------------------------------------------------------- guardar tablas
    cols_primero = ["city_id", "ciudad", "pais", "nivel", "lat", "lon"]
    res_df = res_df[[c for c in cols_primero if c in res_df.columns] +
                    [c for c in res_df.columns if c not in cols_primero]]
    res_df.to_csv(salida / "resumen_ciudades.csv", index=False, encoding="utf-8")
    clim_df.to_csv(salida / "climatologia.csv", index_label="city_id", encoding="utf-8")
    pd.concat(anuales, ignore_index=True)[["city_id", "AÑO", "PROMEDIO_ANUAL", "ANOMALIA", "TIPO"]] \
        .to_csv(salida / "promedios_anuales.csv", index=False, encoding="utf-8")
    largo_all[["city_id", "YEAR", "MES_NUM", "UV_INDEX", "CLIM", "ANOM", "Z"]] \
        .rename(columns={"YEAR": "AÑO", "MES_NUM": "MES", "CLIM": "CLIMATOLOGIA",
                         "ANOM": "ANOMALIA", "Z": "Z_ANOMALIA"}) \
        .to_csv(salida / "anomalias_mensuales.csv", index=False, encoding="utf-8")
    corr.to_csv(salida / "correlaciones_anomalias.csv", encoding="utf-8")

    # --------------------------------------------------------------- GeoJSON
    anual_all = pd.concat(anuales, ignore_index=True)
    features = []
    for _, r in res_df.iterrows():
        cid = r["city_id"]
        props = {k: v for k, v in r.items() if k not in ("lat", "lon")}
        props["lat"], props["lon"] = r["lat"], r["lon"]
        props["climatologia"] = list(clim_df.loc[cid].values)
        a = anual_all[anual_all["city_id"] == cid]
        props["anios"] = list(a["AÑO"].astype(int))
        props["uv_anual"] = list(a["PROMEDIO_ANUAL"])
        props["anios_anomalos_altos"] = list(a.loc[a["TIPO"] == "Alto", "AÑO"].astype(int))
        props["anios_anomalos_bajos"] = list(a.loc[a["TIPO"] == "Bajo", "AÑO"].astype(int))
        features.append({"type": "Feature",
                         "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
                         "properties": props})
    with open(salida / "earthscope_ciudades.geojson", "w", encoding="utf-8") as f:
        json.dump(limpio({"type": "FeatureCollection", "features": features}), f, ensure_ascii=False)
    with open(salida / "conexiones.geojson", "w", encoding="utf-8") as f:
        json.dump(limpio({"type": "FeatureCollection", "features": features_con}), f, ensure_ascii=False)

    # -------------------------------------------- series mensuales (línea de tiempo)
    fechas = pd.date_range(f"{args.inicio}-01-01", f"{args.fin}-12-01", freq="MS")
    uv_wide = largo_all.pivot(index="FECHA", columns="city_id", values="UV_INDEX").reindex(fechas)
    z_wide = z_wide.reindex(fechas)
    series = {"inicio": f"{args.inicio}-01", "fin": f"{args.fin}-12", "n_meses": len(fechas),
              "fechas": [d.strftime("%Y-%m") for d in fechas],
              "ciudades": {cid: {"uv": list(uv_wide[cid].values), "z": list(z_wide[cid].values)}
                           for cid in uv_wide.columns}}
    with open(salida / "series_mensuales.json", "w", encoding="utf-8") as f:
        json.dump(limpio(series), f, ensure_ascii=False)

    # ------------------------------------------------------------------ resumen
    print("\n" + "=" * 70)
    print(f"RESUMEN: {n_ciudades} ciudades analizadas ({args.inicio}-{args.fin})")
    print("=" * 70)
    print(f"Tendencias con p<0.05 sin corregir : {int(res_df['significativa_p05'].sum())}")
    print(f"Tendencias significativas tras FDR : {int(res_df['significativa_fdr'].sum())}")
    print(f"Arcos de correlación (r>={args.umbral_r}) : {len(features_con)}")
    if res_df["misma_celda"].any():
        print("Aviso: ciudades en la misma celda de 1° (series no independientes):")
        print("   " + ", ".join(res_df.loc[res_df["misma_celda"], "city_id"]))
    print(f"\nResultados en: {salida.resolve()}")


if __name__ == "__main__":
    main()