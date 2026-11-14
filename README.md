# EarthScope

EarthScope is an interactive globe for exploring monthly ultraviolet index patterns across 100 cities. The browser reads precomputed NASA POWER data; Python handles acquisition and statistical analysis.

## Run the web app

Requirements: Node.js 20.19+ or 22.12+.

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. No Cesium ion token is needed: the globe uses Cesium's Natural Earth base map.

## Explore

- **UV index:** monthly NASA POWER value for the selected date.
- **Seasonality:** mean profile across the twelve calendar months.
- **Anomalies:** standardized monthly deviation from the city's climatology.
- **Long-term trend:** Sen slope estimated by the Python analysis.
- Search and filter cities by catalog level; choose a month with the timeline or select a point on the globe.
- Correlation links show pairs with correlated monthly anomalies. Correlation does not establish causation.

The city profile includes the 2001–2024 monthly series, seasonal climatology, annual mean, peak month, trend, and FDR significance. City locations inherit NASA POWER's approximate 1° grid resolution.

## Reproduce or update the analysis

This folder includes the Python scripts, catalog, and downloaded city CSV files used for the current results.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python descargar_power.py --fin 2024
python analizar_ciudades.py
```

After creating new results, run `.actualizar-datos.ps1` to copy the generated analysis products into `public/data`, which is what the web app serves. `NASA Callenge` is the original project folder used as the source for this sync script; edit `$sourceResults` in the script if you keep the analysis output elsewhere.

## Data and methods

- NASA POWER monthly `ALLSKY_SFC_UV_INDEX`, 2001–2024.
- Python outputs: monthly UV and standardized anomalies, 12-month climatology, city statistics, trend significance, anomaly correlations, GeoJSON city locations, and correlation connections.
- Correlations are descriptive associations; they do not identify a physical cause.
- City coordinates and elevation are catalog metadata; POWER values represent gridded cells, not ground sensors at each city center.

## Build a static site

```powershell
npm run build
npm run preview
```

Deploy the generated `dist/` directory to any static hosting provider. All app data is shipped under `public/data` and does not require an API server.
