"""
Descarga de índice UV mensual (ALLSKY_SFC_UV_INDEX) desde NASA POWER.

Uso básico:
    python descargar_power.py                      # usa ciudades.csv, 2001 -> último año completo
    python descargar_power.py --fin 2024
    python descargar_power.py --ciudades otras.csv --salida datos_power
    python descargar_power.py --forzar             # vuelve a descargar todo

Para cada ciudad guarda:
    <salida>/<city_id>.csv   -> CSV original de NASA POWER (mismo formato que ya lee tu código:
                                 PARAMETER,YEAR,JAN,...,DEC,ANN)
y al final genera:
    <salida>/uv_mensual_largo.csv  -> tabla larga: city_id, year, month, date, uv_index, ...
    <salida>/resumen_descarga.csv  -> estado y cobertura por ciudad

ciudades.csv necesita las columnas: city_id, lat, lon  (y opcionalmente ciudad, pais, nivel, ...)
"""

import argparse
import datetime as dt
import io
import sys
import time
from pathlib import Path

import pandas as pd
import requests

URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMETRO = "ALLSKY_SFC_UV_INDEX"
MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
         "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
FALTANTE = -999.0


def descargar_ciudad(lat, lon, inicio, fin, comunidad, reintentos=4, pausa=2.0):
    """Devuelve el texto CSV de NASA POWER para un punto. Lanza excepción si falla."""
    params = {
        "parameters": PARAMETRO,
        "community": comunidad,
        "latitude": lat,
        "longitude": lon,
        "start": inicio,
        "end": fin,
        "format": "CSV",
    }
    ultimo_error = None
    for intento in range(1, reintentos + 1):
        try:
            r = requests.get(URL, params=params, timeout=90)
            if r.status_code == 200 and PARAMETRO in r.text:
                return r.text
            ultimo_error = f"HTTP {r.status_code}: {r.text[:200]!r}"
        except requests.RequestException as e:
            ultimo_error = str(e)
        time.sleep(pausa * intento)  # espera creciente
    raise RuntimeError(ultimo_error)


def parsear_csv_power(texto):
    """Convierte el CSV de POWER (con cabecera de metadatos) en DataFrame ancho."""
    lineas = texto.splitlines()
    inicio = next(i for i, l in enumerate(lineas)
                  if l.startswith("PARAMETER,YEAR,JAN"))
    df = pd.read_csv(io.StringIO("\n".join(lineas[inicio:])))
    return df[df["PARAMETER"] == PARAMETRO].copy()


def a_largo(df_ancho, fila_ciudad):
    largo = df_ancho.melt(id_vars=["YEAR"], value_vars=MESES,
                          var_name="mes_txt", value_name="uv_index")
    largo["month"] = largo["mes_txt"].map({m: i + 1 for i, m in enumerate(MESES)})
    largo["uv_index"] = largo["uv_index"].where(largo["uv_index"] != FALTANTE)
    largo = largo.rename(columns={"YEAR": "year"})
    largo["date"] = pd.to_datetime(dict(year=largo["year"], month=largo["month"], day=1))
    largo["city_id"] = fila_ciudad["city_id"]
    largo = largo.sort_values("date")[["city_id", "year", "month", "date", "uv_index"]]
    return largo


def celda_1grado(lat, lon):
    """Centro aproximado de la celda de 1° x 1° (para detectar ciudades que comparten celda)."""
    import math
    return math.floor(lat) + 0.5, math.floor(lon) + 0.5


def main():
    ultimo_completo = dt.date.today().year - 1
    ap = argparse.ArgumentParser(description="Descarga UV mensual de NASA POWER")
    ap.add_argument("--ciudades", default="ciudades.csv")
    ap.add_argument("--salida", default="datos_power")
    ap.add_argument("--inicio", type=int, default=2001)
    ap.add_argument("--fin", type=int, default=ultimo_completo,
                    help="Último año a pedir (por defecto, el último año calendario completo)")
    ap.add_argument("--comunidad", default="RE", choices=["RE", "SB", "AG"])
    ap.add_argument("--forzar", action="store_true", help="Ignora archivos ya descargados")
    ap.add_argument("--pausa", type=float, default=1.0, help="Segundos entre consultas")
    args = ap.parse_args()

    carpeta = Path(args.salida)
    carpeta.mkdir(parents=True, exist_ok=True)
    ciudades = pd.read_csv(args.ciudades)
    faltan = {"city_id", "lat", "lon"} - set(ciudades.columns)
    if faltan:
        sys.exit(f"Faltan columnas en {args.ciudades}: {faltan}")

    tablas, resumen = [], []
    for k, c in ciudades.iterrows():
        ruta = carpeta / f"{c['city_id']}.csv"
        estado = "ok"
        try:
            if ruta.exists() and not args.forzar:
                texto = ruta.read_text(encoding="utf-8")
                estado = "cache"
            else:
                texto = descargar_ciudad(c["lat"], c["lon"], args.inicio, args.fin, args.comunidad)
                ruta.write_text(texto, encoding="utf-8")
                time.sleep(args.pausa)
            largo = a_largo(parsear_csv_power(texto), c)
            tablas.append(largo)
            validos = int(largo["uv_index"].notna().sum())
            esperados = len(largo)
        except Exception as e:  # una ciudad que falla no detiene el resto
            estado, validos, esperados = f"error: {e}", 0, 0
        clat, clon = celda_1grado(c["lat"], c["lon"])
        resumen.append({"city_id": c["city_id"], "estado": estado,
                        "meses_validos": validos, "meses_esperados": esperados,
                        "celda_lat": clat, "celda_lon": clon})
        print(f"[{k + 1}/{len(ciudades)}] {c['city_id']:<5} {estado[:60]:<60} {validos}/{esperados}")

    if tablas:
        todo = pd.concat(tablas, ignore_index=True)
        meta = ciudades.drop(columns=["lat", "lon"], errors="ignore")
        todo = todo.merge(meta, on="city_id", how="left")
        todo.to_csv(carpeta / "uv_mensual_largo.csv", index=False, encoding="utf-8")

    res = pd.DataFrame(resumen)
    # Ciudades que comparten celda de 1° (series no independientes)
    res["comparte_celda"] = res.duplicated(["celda_lat", "celda_lon"], keep=False)
    res.to_csv(carpeta / "resumen_descarga.csv", index=False, encoding="utf-8")
    print(f"\nListo. Archivos en: {carpeta.resolve()}")
    if res["comparte_celda"].any():
        print("Aviso: hay ciudades en la misma celda de 1° (ver resumen_descarga.csv).")


if __name__ == "__main__":
    main()