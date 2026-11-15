"""Prepara las series UV y clasificaciones anuales que consume la web."""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if not math.isfinite(float(value)) else round(float(value), 4)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def read_city(path, start, end):
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    header = next(i for i, line in enumerate(lines) if line.startswith("PARAMETER,YEAR,JAN"))
    data = pd.read_csv(path, skiprows=header)
    data = data[(data["PARAMETER"] == "ALLSKY_SFC_UV_INDEX") & data.YEAR.between(start, end)]
    data = data[data[MONTHS].ne(-999).all(axis=1)]
    return data


def main():
    parser = argparse.ArgumentParser(description="Genera los datos anuales y mensuales de las ciudades.")
    parser.add_argument("--entrada", default="datos_power", help="Carpeta con los CSV de NASA POWER")
    parser.add_argument("--ciudades", default="ciudades.csv")
    parser.add_argument("--salida", default="public/data", help="Carpeta que carga la página")
    parser.add_argument("--inicio", type=int, default=2001)
    parser.add_argument("--fin", type=int, default=2024)
    parser.add_argument("--min-anios", type=int, default=10)
    args = parser.parse_args()

    source, output = Path(args.entrada), Path(args.salida)
    output.mkdir(parents=True, exist_ok=True)
    catalog = pd.read_csv(args.ciudades)
    features, city_series = [], {}
    dates = pd.date_range(f"{args.inicio}-01-01", f"{args.fin}-12-01", freq="MS")
    dates_text = [date.strftime("%Y-%m") for date in dates]

    for _, city in catalog.iterrows():
        city_id = str(city.city_id)
        path = source / f"{city_id}.csv"
        if not path.exists():
            print(f"[salta] {city_id}: falta {path}")
            continue
        try:
            wide = read_city(path, args.inicio, args.fin)
            if len(wide) < args.min_anios:
                print(f"[salta] {city_id}: solo {len(wide)} años completos")
                continue
            monthly = wide.melt(id_vars=["YEAR"], value_vars=MONTHS, var_name="month_name", value_name="uv")
            monthly["month"] = monthly.month_name.map({name: i + 1 for i, name in enumerate(MONTHS)})
            monthly["date"] = monthly.YEAR.astype(int).astype(str) + "-" + monthly.month.astype(str).str.zfill(2)
            monthly = monthly.sort_values(["YEAR", "month"])

            climatology = monthly.groupby("month").uv.mean()
            monthly_sigma = monthly.groupby("month").uv.std().replace(0, np.nan)
            monthly["anomaly"] = monthly.uv - monthly.month.map(climatology)
            monthly["z"] = monthly.anomaly / monthly.month.map(monthly_sigma)

            annual = monthly.groupby("YEAR").uv.mean().rename("uv").reset_index()
            mean, sigma = annual.uv.mean(), annual.uv.std()
            annual["anomaly"] = annual.uv - mean
            annual["classification"] = np.select(
                [annual.anomaly > sigma, annual.anomaly < -sigma],
                ["above", "below"], default="normal")

            props = {k: (v.item() if hasattr(v, "item") else v) for k, v in city.items()}
            props["climatologia"] = [climatology.get(month, np.nan) for month in range(1, 13)]
            props["promedio_anual"] = float(mean)
            props["anios"] = annual.YEAR.astype(int).tolist()
            props["uv_anual"] = annual.uv.tolist()
            props["anomalia_anual"] = annual.anomaly.tolist()
            props["clasificacion_anual"] = annual.classification.tolist()
            props["umbral_anual"] = float(sigma)
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [city.lon, city.lat]}, "properties": props})

            city_series[city_id] = {
                "uv": monthly.uv.tolist(), "anomaly": monthly.anomaly.tolist(), "z": monthly.z.tolist(),
                "dates": monthly.date.tolist(),
                "climatologia": props["climatologia"], "promedio_anual": float(mean),
                "anios": props["anios"], "uv_anual": props["uv_anual"],
                "anomalia_anual": props["anomalia_anual"], "clasificacion_anual": props["clasificacion_anual"],
            }
            print(f"[ok] {city_id}: {len(annual)} años, promedio {mean:.2f} UV")
        except Exception as error:
            print(f"[error] {city_id}: {error}")

    if not features:
        raise SystemExit("No se pudo analizar ninguna ciudad. Revisa datos_power y ciudades.csv.")

    for series in city_series.values():
        row_dates = series.pop("dates")
        for key in ("uv", "anomaly", "z"):
            by_date = dict(zip(row_dates, series[key]))
            series[key] = [by_date.get(date) for date in dates_text]

    geojson = {"type": "FeatureCollection", "features": features}
    payload = {"inicio": f"{args.inicio}-01", "fin": f"{args.fin}-12", "fechas": dates_text, "ciudades": city_series}
    (output / "earthscope_ciudades.geojson").write_text(json.dumps(clean(geojson), ensure_ascii=False), encoding="utf-8")
    (output / "series_mensuales.json").write_text(json.dumps(clean(payload), ensure_ascii=False), encoding="utf-8")
    print(f"\nDatos de {len(features)} ciudades escritos en {output.resolve()}")


if __name__ == "__main__":
    main()
