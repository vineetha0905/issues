import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icons for different status
const createCustomIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = createCustomIcon('red');
const orangeIcon = createCustomIcon('orange');
const greenIcon = createCustomIcon('green');

const IssueMap = ({ issues = null, onMarkerClick = null }) => {
  const [mapCenter] = useState([23.2599, 77.4126]); // Bhopal coordinates
  const [mockIssues] = useState([
    {
      id: '1',
      title: 'Broken Street Light',
      location: 'MG Road, Bhopal',
      coordinates: [23.2599, 77.4126],
      status: 'reported',
      upvotes: 15,
      description: 'Street light has been broken for 3 days'
    },
    {
      id: '2',
      title: 'Pothole on Main Road',
      location: 'DB City Mall Road',
      coordinates: [23.2456, 77.4200],
      status: 'in-progress',
      upvotes: 28,
      description: 'Large pothole causing traffic issues'
    },
    {
      id: '3',
      title: 'Garbage Overflow',
      location: 'Arera Colony',
      coordinates: [23.2300, 77.4300],
      status: 'resolved',
      upvotes: 42,
      description: 'Garbage bin overflowing since Monday'
    },
    {
      id: '4',
      title: 'Water Leakage',
      location: 'New Market Area',
      coordinates: [23.2650, 77.4100],
      status: 'reported',
      upvotes: 8,
      description: 'Water pipe leaking on footpath'
    },
    {
      id: '5',
      title: 'Traffic Signal Malfunction',
      location: 'Bittan Market Chowk',
      coordinates: [23.2500, 77.4250],
      status: 'in-progress',
      upvotes: 35,
      description: 'Traffic signal not working properly'
    }
  ]);

  const displayIssues = issues || mockIssues;

  const getMarkerIcon = (status) => {
    switch (status) {
      case 'reported':
        return redIcon;
      case 'in-progress':
        return orangeIcon;
      case 'resolved':
        return greenIcon;
      default:
        return redIcon;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'reported':
        return 'Reported';
      case 'in-progress':
        return 'In Progress';
      case 'resolved':
        return 'Resolved';
      default:
        return 'Unknown';
    }
  };

  const handleMarkerClick = (issue) => {
    if (onMarkerClick) {
      onMarkerClick(issue);
    }
  };

  return (
    <div className="map-container">
      <MapContainer
        center={mapCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {displayIssues.map((issue) => (
          <Marker
            key={issue.id}
            position={issue.coordinates}
            icon={getMarkerIcon(issue.status)}
            eventHandlers={{
              click: () => handleMarkerClick(issue),
            }}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <h4 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '14px', 
                  fontWeight: '600',
                  color: '#1e293b'
                }}>
                  {issue.title}
                </h4>
                <p style={{ 
                  margin: '4px 0', 
                  fontSize: '12px', 
                  color: '#64748b' 
                }}>
                  📍 {issue.location}
                </p>
                <p style={{ 
                  margin: '4px 0', 
                  fontSize: '12px', 
                  color: '#64748b' 
                }}>
                  {issue.description}
                </p>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginTop: '8px'
                }}>
                  <span style={{ 
                    fontSize: '11px', 
                    padding: '2px 6px',
                    borderRadius: '10px',
                    background: issue.status === 'reported' ? '#fef3c7' : 
                              issue.status === 'in-progress' ? '#dbeafe' : '#d1fae5',
                    color: issue.status === 'reported' ? '#92400e' : 
                           issue.status === 'in-progress' ? '#1e40af' : '#065f46'
                  }}>
                    {getStatusText(issue.status)}
                  </span>
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#64748b' 
                  }}>
                    👍 {issue.upvotes}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default IssueMap;