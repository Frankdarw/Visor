// Capa de prueba: tendencia sintética (°C por década) sobre una cuadrícula global.
// NO son datos reales. Sirve para validar que un raster georreferenciado
// se dibuja correctamente sobre el globo. Se reemplazará por teselas reales.

export const RANGE = 0.8; // la escala de color va de -RANGE a +RANGE

const rad = (d) => (d * Math.PI) / 180;

// Función determinista: calentamiento mayor hacia los polos (amplificación polar)
// más ondulaciones suaves que imitan diferencias regionales.
export function trendAt(lat, lon) {
  const polar = 0.18 + 0.42 * Math.pow(Math.abs(Math.sin(rad(lat))), 2.2);
  const waves =
    0.16 * Math.sin(rad(lon * 2.0) + rad(lat) * 1.3) +
    0.12 * Math.cos(rad(lon * 3.0) - rad(lat) * 2.1) +
    0.08 * Math.sin(rad(lon * 5.0 + 40) + rad(lat) * 3.0);
  const coolPocket = -0.55 * Math.exp(-(((lat + 55) / 10) ** 2 + ((lon + 40) / 35) ** 2));
  return polar + waves + coolPocket;
}

// Colormap divergente: azul (enfría) – blanco (sin cambio) – rojo (calienta)
const STOPS = [
  [-1.0, [33, 102, 172]],
  [-0.5, [103, 169, 207]],
  [0.0, [247, 247, 247]],
  [0.5, [239, 138, 98]],
  [1.0, [178, 24, 43]],
];

export function colorFor(value) {
  const t = Math.max(-1, Math.min(1, value / RANGE));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Devuelve un data URL PNG equirectangular (-180..180, -90..90).
export function buildTestRasterDataUrl(width = 1440, height = 720) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) / height) * 180;
    for (let x = 0; x < width; x++) {
      const lon = -180 + ((x + 0.5) / width) * 360;
      const [r, g, b] = colorFor(trendAt(lat, lon));
      const i = (y * width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function legendGradientCss() {
  const n = 12;
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const v = -RANGE + (2 * RANGE * i) / n;
    const [r, g, b] = colorFor(v);
    parts.push(`rgb(${r},${g},${b}) ${(i / n) * 100}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
