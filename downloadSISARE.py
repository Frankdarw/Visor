#!/usr/bin/env python3
"""
Descarga datos horarios del SISAIRE (IDEAM) desde datos.gov.co y los pasa a promedios mensuales.

    pip install requests pandas numpy
    python downloadSISARE.py inspeccionar
    python downloadSISARE.py descargar --desde 2018
    python downloadSISARE.py mensual

Opcional (evita límites de velocidad):  $env:SOCRATA_TOKEN="tu_token"
"""
import argparse, os, sys, time
import numpy as np
import pandas as pd
import requests

BASE = "https://www.datos.gov.co"
DATASET = "g4t8-zkc3"
PAGE = 50000
RAW = "sisaire_crudo.csv"

# Códigos de contaminante buscados (columna msfl_code). Se comparan en mayúsculas.
VARIABLES = ["O3", "NO2", "NO", "NOX"]
# Raíces sin tilde; se buscan con LIKE sobre el municipio en mayúsculas
CIUDADES = ["BOGOT", "MEDELL", "ITAG", "BELLO", "GIRARDOTA", "BUCARAMANGA", "NEIVA"]

CANDIDATAS = {
    "estacion":  ["estacion_id", "estacion", "nombre_est"],
    "nombre":    ["nombre_est", "nombre_estacion"],
    "fecha":     ["med_fecha_inicio", "fecha", "fecha_hora"],
    "variable":  ["msfl_code", "variable", "contaminante", "parametro"],
    "valor":     ["med_concentracion_estandar", "valor", "concentracion"],
    "municipio": ["municipio", "nombre_del_municipio", "ciudad"],
    "unidad":    ["sigla_unidad", "unidades", "unidad"],
}
OPCIONALES = {"unidad", "nombre"}


def headers():
    tok = os.environ.get("SOCRATA_TOKEN")
    return {"X-App-Token": tok} if tok else {}


def columnas_remotas():
    r = requests.get(f"{BASE}/api/views/{DATASET}.json", headers=headers(), timeout=60)
    r.raise_for_status()
    return [(c["fieldName"], c.get("dataTypeName", "?")) for c in r.json()["columns"]]


def resolver(cols):
    nombres = [c for c, _ in cols]
    out = {}
    for clave, opciones in CANDIDATAS.items():
        hallada = next((o for o in opciones if o in nombres), None)
        out[clave] = hallada
    return out


def codigos_disponibles(m):
    """Lista los valores distintos de la columna de contaminante, con conteo."""
    v = m["variable"]
    r = requests.get(f"{BASE}/resource/{DATASET}.json",
                     params={"$select": f"{v},count(*) as n", "$group": v,
                             "$order": "n DESC", "$limit": 200},
                     headers=headers(), timeout=180)
    r.raise_for_status()
    return pd.DataFrame(r.json())


def inspeccionar():
    cols = columnas_remotas()
    m = resolver(cols)
    print("Columnas resueltas:", m)
    print("\nContaminantes disponibles (columna", m["variable"], "):")
    print(codigos_disponibles(m).to_string(index=False))


def descargar(desde=None):
    cols = columnas_remotas()
    m = resolver(cols)
    faltan = [k for k, v in m.items() if v is None and k not in OPCIONALES]
    if faltan:
        sys.exit(f"No pude identificar columnas {faltan}.")

    cods = codigos_disponibles(m)
    existentes = cods[m["variable"]].astype(str).tolist()
    usar = [c for c in existentes if c.upper().strip() in VARIABLES]
    if not usar:
        sys.exit(f"Ningún código de {VARIABLES} en el conjunto. Existen: {existentes}")
    print("Contaminantes a bajar:", usar)

    vars_sql = ",".join("'" + c.replace("'", "''") + "'" for c in usar)
    ciud_sql = " OR ".join(f"upper({m['municipio']}) like '%{c}%'" for c in CIUDADES)
    where = f"{m['variable']} in({vars_sql}) AND ({ciud_sql})"
    if desde:
        where += f" AND {m['fecha']} >= '{desde}-01-01'"

    url = f"{BASE}/resource/{DATASET}.json"
    offset, total, primera = 0, 0, True
    if os.path.exists(RAW):
        os.remove(RAW)
    while True:
        params = {"$where": where, "$limit": PAGE, "$offset": offset, "$order": ":id"}
        for intento in range(5):
            try:
                r = requests.get(url, params=params, headers=headers(), timeout=180)
                r.raise_for_status()
                break
            except requests.RequestException as e:
                print("  reintento", intento + 1, e)
                time.sleep(3 * (intento + 1))
        else:
            sys.exit("Falló la descarga tras 5 intentos.")
        filas = r.json()
        if not filas:
            break
        pd.DataFrame(filas).to_csv(RAW, mode="w" if primera else "a",
                                   header=primera, index=False)
        primera = False
        total += len(filas)
        offset += len(filas)
        print(f"  {total:,} filas")
        if len(filas) < PAGE:
            break
    print(f"Listo: {total:,} filas en {RAW}")


# ---------- Agregación mensual (registros horarios) ----------
def mensual_desde_horario(df, m):
    unidad = df[m["unidad"]].astype(str) if m.get("unidad") else "?"
    d = pd.DataFrame({
        "municipio": df[m["municipio"]].astype(str).str.upper().str.strip(),
        "estacion": df[m["estacion"]].astype(str),
        "variable": df[m["variable"]].astype(str).str.upper().str.strip(),
        "unidad": unidad,
        "fecha": pd.to_datetime(df[m["fecha"]], errors="coerce"),
        "valor": pd.to_numeric(df[m["valor"]], errors="coerce"),
    })
    d = d.dropna(subset=["fecha", "valor"])
    d = d[d["valor"] > -990]          # centinelas tipo -999

    filas = []
    for (mun, est, var, uni), g in d.groupby(["municipio", "estacion", "variable", "unidad"]):
        s = g.drop_duplicates("fecha").set_index("fecha")["valor"].sort_index()
        s = s.resample("h").mean()
        if var == "O3":
            m8 = s.rolling(8, min_periods=6).mean()
            diario = m8.resample("D").agg(["max", "count"])
            diario = diario[diario["count"] >= 18]["max"]
        else:
            diario = s.resample("D").agg(["mean", "count"])
            diario = diario[diario["count"] >= 18]["mean"]
        if diario.empty:
            continue
        mes = diario.resample("MS").agg(["mean", "count"])
        mes["dias_mes"] = mes.index.days_in_month
        mes = mes[mes["count"] >= 0.75 * mes["dias_mes"]]
        for f, row in mes.iterrows():
            filas.append((mun, est, var, uni, f, row["mean"], int(row["count"])))
    return pd.DataFrame(filas, columns=["municipio", "estacion", "variable", "unidad",
                                        "mes", "valor_mensual", "dias_validos"])


def mensual():
    if not os.path.exists(RAW):
        sys.exit(f"No existe {RAW}. Corre 'descargar' primero.")
    df = pd.read_csv(RAW, low_memory=False)
    m = resolver([(c, "") for c in df.columns])
    if "duraci_n" in df.columns:
        print("Duraciones (duraci_n):", df["duraci_n"].value_counts().head(5).to_dict())
    est = mensual_desde_horario(df, m)
    est.to_csv("sisaire_mensual_estacion.csv", index=False)
    ciudad = (est.groupby(["municipio", "variable", "unidad", "mes"])
                 .agg(valor=("valor_mensual", "mean"), n_estaciones=("estacion", "nunique"))
                 .reset_index())
    ciudad.to_csv("sisaire_mensual_ciudad.csv", index=False)
    print("Escribí sisaire_mensual_estacion.csv y sisaire_mensual_ciudad.csv")
    print(ciudad.groupby(["municipio", "variable", "unidad"])["mes"]
                .agg(["min", "max", "count"]))
    print("\nAVISO: no mezcles unidades distintas (µg/m3 vs ppb/ppm) al comparar ciudades.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inspeccionar")
    d = sub.add_parser("descargar")
    d.add_argument("--desde", type=int, default=None, help="año inicial, p. ej. 2018")
    sub.add_parser("mensual")
    a = ap.parse_args()
    {"inspeccionar": inspeccionar,
     "descargar": lambda: descargar(a.desde),
     "mensual": mensual}[a.cmd]()