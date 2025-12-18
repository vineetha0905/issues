import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
const blueIcon = createCustomIcon('blue');

// Component to update map center when location changes
const MapUpdater = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center && center.length === 2) {
      map.setView(center, 13);
    }
  }, [center, map]);
  
  return null;
};

const IssueMap = ({ issues = null, onMarkerClick = null, center = null, showCenterMarker = true }) => {
  const [mapCenter, setMapCenter] = useState([16.0716, 77.9053]); // Default fallback
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  
  // Debug logging
  console.log('IssueMap received issues:', issues);
  console.log('IssueMap issues type:', typeof issues);
  console.log('IssueMap issues length:', issues?.length);

  // Get user's current location
  useEffect(() => {
    const getCurrentLocation = () => {
      if (!navigator.geolocation) {
        setLocationError('Geolocation is not supported by this browser.');
        setIsLoadingLocation(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = [latitude, longitude];
          setUserLocation(newLocation);
          setMapCenter(newLocation);
          setIsLoadingLocation(false);
          console.log('User location obtained:', newLocation);
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationError('Unable to retrieve your location. Using default location.');
          setIsLoadingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    };

    // If center is provided, use it; otherwise get user location
    if (center && Array.isArray(center) && center.length === 2) {
      setMapCenter(center);
      setUserLocation(center);
      setIsLoadingLocation(false);
    } else {
      getCurrentLocation();
    }
  }, [center]);

  // Generate nearby issues based on user location
  const generateNearbyIssues = (userLoc) => {
    if (!userLoc) return [];
    
    const baseIssues = [
      {
        id: '1',
        title: 'Broken Street Light',
        location: 'Near Your Location',
        coordinates: [userLoc[0] + 0.001, userLoc[1] + 0.001],
        status: 'reported',
        upvotes: 15,
        description: 'Street light has been broken for 3 days'
      },
      {
        id: '2',
        title: 'Pothole on Main Road',
        location: 'Near Your Location',
        coordinates: [userLoc[0] + 0.002, userLoc[1] - 0.001],
        status: 'in-progress',
        upvotes: 28,
        description: 'Large pothole causing traffic issues'
      },
      {
        id: '3',
        title: 'Garbage Overflow',
        location: 'Near Your Location',
        coordinates: [userLoc[0] - 0.001, userLoc[1] + 0.002],
        status: 'resolved',
        upvotes: 42,
        description: 'Garbage bin overflowing since Monday'
      },
      {
        id: '4',
        title: 'Water Leakage',
        location: 'Near Your Location',
        coordinates: [userLoc[0] + 0.003, userLoc[1] + 0.001],
        status: 'reported',
        upvotes: 8,
        description: 'Water pipe leaking on footpath'
      },
      {
        id: '5',
        title: 'Traffic Signal Malfunction',
        location: 'Near Your Location',
        coordinates: [userLoc[0] - 0.002, userLoc[1] - 0.002],
        status: 'in-progress',
        upvotes: 35,
        description: 'Traffic signal not working properly'
      }
    ];
    
    return baseIssues;
  };

  // Use provided issues or generate nearby issues based on user location
  const displayIssues = issues || (userLocation ? generateNearbyIssues(userLocation) : []);
  console.log('IssueMap displayIssues:', displayIssues);
  console.log('IssueMap displayIssues length:', displayIssues.length);

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
        key={`${mapCenter[0]},${mapCenter[1]}`}
        center={mapCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <MapUpdater center={mapCenter} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* User location marker */}
        {userLocation && showCenterMarker && (
          <Marker position={userLocation} icon={blueIcon}>
            <Popup>
              <div style={{ minWidth: '150px', textAlign: 'center' }}>
                <h4 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '14px', 
                  fontWeight: '600',
                  color: '#1e293b'
                }}>
                  📍 Your Location
                </h4>
                <p style={{ 
                  margin: '4px 0', 
                  fontSize: '12px', 
                  color: '#64748b' 
                }}>
                  {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Issue markers */}
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