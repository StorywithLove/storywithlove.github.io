import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { YULARA_CENTRE } from "../data/sites";
import type { SiteId, SolarSite } from "../types";

interface SiteMapProps {
  sites: SolarSite[];
  selectedSiteId: SiteId;
  onSelect: (siteId: SiteId) => void;
}

function MapFocus({ site }: { site: SolarSite | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (site) map.flyTo([site.latitude, site.longitude], 14, { duration: 0.65 });
  }, [map, site]);
  return null;
}

export function SiteMap({ sites, selectedSiteId, onSelect }: SiteMapProps) {
  const [tileError, setTileError] = useState(false);
  const markerRefs = useRef(new Map<SiteId, L.Marker>());
  const icons = useMemo(
    () =>
      new Map(
        sites.map((site) => [
          site.id,
          L.divIcon({
            className: "site-marker-wrap",
            html: `<span class="site-marker ${selectedSiteId === site.id ? "is-selected" : ""}" style="--marker-color:${site.color}">${site.arrayLabel}</span>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          }),
        ]),
      ),
    [selectedSiteId, sites],
  );

  useEffect(() => {
    markerRefs.current.get(selectedSiteId)?.openPopup();
  }, [selectedSiteId]);

  return (
    <div className="map-shell">
      <MapContainer
        center={YULARA_CENTRE}
        zoom={12}
        scrollWheelZoom
        className="project-map"
        aria-label="Yulara 五个光伏子系统的交互式地图"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="普通地图">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{ tileerror: () => setTileError(true) }}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="卫星影像">
            <TileLayer
              attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              eventHandlers={{ tileerror: () => setTileError(true) }}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        {sites.map((site) => (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={icons.get(site.id)}
            ref={(marker) => {
              if (marker) markerRefs.current.set(site.id, marker);
            }}
            eventHandlers={{ click: () => onSelect(site.id) }}
            keyboard
            title={`${site.name}，site_id ${site.id}`}
          >
            <Popup>
              <div className="map-popup">
                <span>ARRAY {site.arrayLabel}</span>
                <strong>{site.name}</strong>
                <dl>
                  <div><dt>site_id</dt><dd>{site.id}</dd></div>
                  <div><dt>装机</dt><dd>{site.capacityKw.toLocaleString()} kW</dd></div>
                  <div><dt>坐标</dt><dd>{site.latitude}, {site.longitude}</dd></div>
                  <div><dt>阵列</dt><dd>{site.technology}<br />{site.structure}</dd></div>
                </dl>
              </div>
            </Popup>
          </Marker>
        ))}
        <MapFocus site={sites.find((site) => site.id === selectedSiteId)} />
      </MapContainer>
      {tileError && (
        <p className="map-fallback" role="status">
          部分底图图块暂时无法加载；站点列表和数据功能仍可使用。
        </p>
      )}
    </div>
  );
}
