import React from 'react';
import { WebView } from 'react-native-webview';

const getMarkerCoordinate = (children, initialRegion) => {
  const marker = React.Children.toArray(children).find((child) => child?.props?.coordinate);
  return marker?.props?.coordinate || {
    latitude: initialRegion?.latitude,
    longitude: initialRegion?.longitude,
  };
};

const buildLeafletHTML = ({ latitude, longitude }) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #map { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var latitude = ${latitude};
      var longitude = ${longitude};
      var map = L.map('map', { zoomControl: true }).setView([latitude, longitude], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      var icon = L.divIcon({
        className: '',
        html: '<div style="width:34px;height:34px;background:#10b981;border:3px solid:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)"><svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker([latitude, longitude], { icon: icon }).addTo(map);
    </script>
  </body>
  </html>
`;

const MapView = ({ children, initialRegion, style }) => {
  const coordinate = getMarkerCoordinate(children, initialRegion);
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return (
    <WebView
      style={style}
      source={{ html: buildLeafletHTML({ latitude, longitude }) }}
      javaScriptEnabled
      originWhitelist={['*']}
    />
  );
};

const Marker = () => null;

export { Marker };
export default MapView;
