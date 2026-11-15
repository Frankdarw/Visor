"""Descarga archivos mensuales CSV de NASA POWER por ciudad."""

import argparse
import csv
import datetime as dt
import time
from pathlib import Path

import requests

URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
PARAMETER = "ALLSKY_SFC_UV_INDEX"


def download_city(lat, lon, start, end, community, retries=4):
    params = {
        "parameters": PARAMETER, "community": community,
        "latitude": lat, "longitude": lon,
        "start": start, "end": end, "format": "CSV",
    }
    last_error = ""
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(URL, params=params, timeout=90)
            if response.status_code == 200 and PARAMETER in response.text:
                return response.text
            last_error = f"HTTP {response.status_code}: {response.text[:200]}"
        except requests.RequestException as error:
            last_error = str(error)
        time.sleep(2 * attempt)
    raise RuntimeError(last_error)


def main():
    parser = argparse.ArgumentParser(description="Descarga índice UV mensual de NASA POWER.")
    parser.add_argument("--ciudades", default="ciudades.csv")
    parser.add_argument("--salida", default="datos_power")
    parser.add_argument("--inicio", type=int, default=2001)
    parser.add_argument("--fin", type=int, default=2024)
    parser.add_argument("--comunidad", default="RE", choices=["RE", "SB", "AG"])
    parser.add_argument("--forzar", action="store_true", help="Vuelve a descargar aunque haya archivos guardados.")
    parser.add_argument("--pausa", type=float, default=1.0)
    args = parser.parse_args()

    catalog_path = Path(args.ciudades)
    output = Path(args.salida)
    output.mkdir(parents=True, exist_ok=True)
    with catalog_path.open(encoding="utf-8-sig", newline="") as file:
        cities = list(csv.DictReader(file))
    missing = {"city_id", "lat", "lon"} - (set(cities[0]) if cities else set())
    if missing:
        raise SystemExit(f"Faltan columnas en {catalog_path}: {', '.join(sorted(missing))}")

    for index, city in enumerate(cities, 1):
        city_id = city["city_id"]
        path = output / f"{city_id}.csv"
        try:
            if path.exists() and not args.forzar:
                status = "guardado"
            else:
                text = download_city(city["lat"], city["lon"], args.inicio, args.fin, args.comunidad)
                path.write_text(text, encoding="utf-8")
                status = "descargado"
                time.sleep(args.pausa)
        except Exception as error:
            status = f"error: {error}"
        print(f"[{index}/{len(cities)}] {city_id}: {status}")

    print(f"\nCSV originales de NASA POWER en {output.resolve()}")


if __name__ == "__main__":
    main()
