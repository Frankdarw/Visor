# EarthScope

Visor de índice UV mensual de NASA POWER para las ciudades de `ciudades.csv`. La página muestra el globo, permite recorrer los meses y grafica el promedio anual de la ciudad seleccionada. Los años se clasifican como por encima, por debajo o normales según su desviación frente al promedio anual de esa ciudad.

## Ejecutar

```powershell
npm install
npm run dev
```

## Actualizar datos

Instala las dependencias de Python una vez:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Descarga los datos mensuales y genera los archivos que carga la página:

```powershell
python descargar_power.py
python analizar_ciudades.py
```

El análisis escribe directamente `public/data/series_mensuales.json` y `public/data/earthscope_ciudades.geojson`. También se puede ejecutar `actualizar-datos.ps1` para regenerarlos sin volver a descargar.

## Datos y clasificación

- Fuente: NASA POWER, parámetro mensual `ALLSKY_SFC_UV_INDEX`.
- El análisis conserva años completos entre 2001 y 2024.
- Un año queda **por encima** si su promedio anual supera el promedio de la ciudad por más de una desviación estándar; **por debajo** si queda más de una desviación estándar bajo el promedio; los demás son **normales**.
- La anomalía mensual compara cada mes con la climatología de ese mismo mes. En el mapa, las clases usan ±1 desviación estándar mensual.

Para crear el sitio estático: `npm run build`. Los archivos listos para publicar quedan en `dist/`.
