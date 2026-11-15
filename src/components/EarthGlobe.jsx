import { useEffect, useRef } from "react";
import {
  Viewer, CameraEventType, ImageryLayer, UrlTemplateImageryProvider,
  Cartesian2, Cartesian3, Color, ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

const colorFor = (value, mode) => {
  if (mode === "anomaly") return Color.fromCssColorString(value > 1 ? "#ff896f" : value < -1 ? "#1412ac" : "#70cbb2").withAlpha(0.92);
  const t = Math.max(0, Math.min(1, (value ?? 0) / 10));
  return Color.fromCssColorString(t < 0.52 ? "#f5c56e" : "#ff765e").withAlpha(0.55 + t * 0.4);
};

export default function EarthGlobe({ cities = [], mode, selected, monthIndex, onPick, autoFocus = true, initialView = [-25, 18, 19000000] }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cityEntities = useRef(new Map());
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const imageryProvider = new UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      credit: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      maximumLevel: 19,
    });
    const baseLayer = new ImageryLayer(imageryProvider);
    const viewer = new Viewer(containerRef.current, {
      baseLayer, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, animation: false,
      timeline: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: false,
    });
    viewerRef.current = viewer;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5;
    viewer.scene.backgroundColor = Color.fromCssColorString("#101a14");
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH];
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(...initialView) });
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
      const value = mode === "anomaly" ? (city._z ?? 0) : (city._uv ?? 0);
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
    if (!viewer || !selected || !autoFocus) return;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(selected.lon, selected.lat, 1700000), duration: 0.8 });
  }, [selected?.id, autoFocus]);

  return <div ref={containerRef} className="globe" aria-label="Interactive globe showing UV data across selected cities" />;
}
