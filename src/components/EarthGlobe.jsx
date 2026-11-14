import { useEffect, useRef } from "react";
import {
  Viewer, CameraEventType, ImageryLayer, TileMapServiceImageryProvider,
  Cartesian2, Cartesian3, Color, ScreenSpaceEventHandler,
  ScreenSpaceEventType, buildModuleUrl,
} from "cesium";

const colorFor = (value, mode) => {
  if (mode === "anomaly") return Color.fromCssColorString(value >= 0 ? "#ff896f" : "#77bce9").withAlpha(0.92);
  if (mode === "trend") return Color.fromCssColorString(value >= 0 ? "#ff9b6b" : "#68c6d3").withAlpha(0.94);
  if (mode === "season") {
    const t = Math.max(0, Math.min(1, value / 10));
    return Color.fromCssColorString(t < 0.55 ? "#79d5bd" : "#f0bd68").withAlpha(0.92);
  }
  const t = Math.max(0, Math.min(1, (value ?? 0) / 10));
  return Color.fromCssColorString(t < 0.52 ? "#f5c56e" : "#ff765e").withAlpha(0.55 + t * 0.4);
};

export default function EarthGlobe({ cities, links, mode, selected, monthIndex, onPick }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cityEntities = useRef(new Map());
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const baseLayer = ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")));
    const viewer = new Viewer(containerRef.current, {
      baseLayer, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, animation: false,
      timeline: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: false,
    });
    viewerRef.current = viewer;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.backgroundColor = Color.fromCssColorString("#07131b");
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(-25, 18, 27000000) });
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(click => {
      const hit = viewer.scene.pick(click.position);
      const id = hit?.id?.properties?.city_id?.getValue?.();
      if (id) onPickRef.current(id);
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => { handler.destroy(); viewer.destroy(); viewerRef.current = null; cityEntities.current.clear(); };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const active = new Set(cities.map(c => c.id));
    for (const [id, entity] of cityEntities.current) if (!active.has(id)) { viewer.entities.remove(entity); cityEntities.current.delete(id); }
    for (const city of cities) {
      const value = mode === "anomaly" ? (city._z ?? 0) : mode === "season" ? (city.climatologia?.[monthIndex % 12] ?? 0) : mode === "trend" ? (city.sen_pendiente ?? 0) * 100 : (city._uv ?? 0);
      let entity = cityEntities.current.get(city.id);
      const color = colorFor(value, mode);
      if (!entity) {
        entity = viewer.entities.add({
          position: Cartesian3.fromDegrees(city.lon, city.lat),
          point: { pixelSize: 8, color, outlineColor: Color.fromCssColorString("#0a1920"), outlineWidth: 1.5, disableDepthTestDistance: 1e7 },
          properties: { city_id: city.id },
          label: { text: city.ciudad, font: "11px sans-serif", fillColor: Color.WHITE, outlineColor: Color.fromCssColorString("#07131b"), outlineWidth: 3, style: 2, pixelOffset: new Cartesian2(0, -14), show: false, disableDepthTestDistance: 1e7 },
        });
        cityEntities.current.set(city.id, entity);
      }
      entity.point.color = color;
      entity.point.pixelSize = city.id === selected?.id ? 13 : 8;
      entity.label.show = city.id === selected?.id;
    }
  }, [cities, mode, monthIndex, selected]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selected) return;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(selected.lon, selected.lat, 8000000), duration: 1.1 });
  }, [selected?.id]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Rebuild a modest correlation network. Width and opacity encode |r|.
    const old = viewer.entities.values.filter(entity => entity.properties?.isLink?.getValue?.());
    old.forEach(entity => viewer.entities.remove(entity));
    for (const feature of links) {
      const p = feature.properties;
      const coordinates = feature.geometry.coordinates;
      const positions = coordinates.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
      viewer.entities.add({ properties: { isLink: true }, polyline: { positions, width: 0.6 + Math.abs(p.r) * 2, material: Color.fromCssColorString(p.r >= 0 ? "#5ec7bb" : "#8197d8").withAlpha(0.16 + Math.abs(p.r) * 0.48), arcType: 1 } });
    }
  }, [links]);

  return <div ref={containerRef} className="globe" aria-label="Interactive globe showing UV data across selected cities" />;
}
