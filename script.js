// Cache-bust trigger for GitHub sync engine

let map;
let userMarker;
let poiLayerGroup;
let legendContainer;
let routeLineGroup; 
let userLat = 0;
let userLng = 0;

// New Navigation Modes
let isFollowMode = false; 

// Efficiency Tracking variables to prevent redundant API spam
let lastFetchedLat = 0;
let lastFetchedLng = 0;
const MIN_MOVEMENT_METRES = 500; 

// Track current nearest handles globally so the key can route to them on click
let currentNearestData = {
    medical: null,
    police: null,
    fuel: null
};

function initMap() {
    map = L.map('map').setView([0, 0], 2);

    L.gridLayer.googleMutant({
        type: 'roadmap' 
    }).addTo(map);

    poiLayerGroup = L.layerGroup().addTo(map);
    routeLineGroup = L.layerGroup().addTo(map); 

    const legend = L.control({ position: 'topleft' });
    legend.onAdd = function () {
        legendContainer = L.DomUtil.create('div', 'map-legend');
        updateLegendUI({}, getHistory());
        return legendContainer;
    };
    legend.addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(updateLocation, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: 3000, 
            timeout: 10000
        });
    } else {
        alert("Geolocation tracking is not supported by this browser.");
    }
}

function getHistory() {
    return {
        medical: localStorage.getItem('hist_medical') || "None tracked yet",
        police: localStorage.getItem('hist_police') || "None tracked yet",
        fuel: localStorage.getItem('hist_fuel') || "None tracked yet"
    };
}

function updateLegendUI(nearest, history = getHistory()) {
    const formatNearest = (item, keyName) => {
        if (!item || item.dist === Infinity) return `<br><small style="color: #888;">Scanning Google...</small>`;
        const distanceKM = (item.dist / 1000).toFixed(1);
        
        return `
            <br><small style="color: #444; font-weight: bold;">${item.name} (${distanceKM} km)</small>
            <br><button onclick="drawRouteTo('${keyName}')" style="margin-top:4px; padding:2px 6px; font-size:11px; background:#0051ff; color:white; border:none; border-radius:3px; cursor:pointer;">Show Route</button>
        `;
    };

    // Added a global Navigation Control Panel at the top of the key
    legendContainer.innerHTML = `
        <h4>Map Tracker</h4>
        
        <div style="margin-bottom: 12px; background: #f4f4f4; padding: 6px; border-radius: 4px; display: flex; gap: 6px;">
            <button onclick="toggleFollowMode()" id="followBtn" style="flex: 1; padding: 4px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                ${isFollowMode ? '🛰️ Following: ON' : '🛰️ Follow Me'}
            </button>
            <button onclick="clearActiveRoute()" style="flex: 1; padding: 4px; font-size: 11px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                ❌ Exit Route
            </button>
        </div>

        <div style="margin-bottom: 12px;"><span class="legend-key" style="background-color: #ff68ae;"></span>Your Location</div>
        
        <div style="margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">
            <span class="legend-key" style="background-color: #dc3545;"></span>Emergency/Medical ${formatNearest(nearest.medical, 'medical')}
            <div style="font-size:10px; color:#666; margin-top:2px;">Prev Closest: <b>${history.medical}</b></div>
        </div>
        
        <div style="margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 6px;">
            <span class="legend-key" style="background-color: #0051ff;"></span>Police Station ${formatNearest(nearest.police, 'police')}
            <div style="font-size:10px; color:#666; margin-top:2px;">Prev Closest: <b>${history.police}</b></div>
        </div>
        
        <div style="margin-bottom: 12px; padding-bottom: 4px;">
            <span class="legend-key" style="background-color: #00ff0d;"></span>Petrol Station ${formatNearest(nearest.fuel, 'fuel')}
            <div style="font-size:10px; color:#666; margin-top:2px;">Prev Closest: <b>${history.fuel}</b></div>
        </div>
    `;
}

// Feature 1: Toggle Follow Mode Tracking Loop
window.toggleFollowMode = function() {
    isFollowMode = !isFollowMode;
    const btn = document.getElementById('followBtn');
    
    if (isFollowMode) {
        btn.innerText = "🛰️ Following: ON";
        btn.style.backgroundColor = "#17a2b8";
        map.setView([userLat, userLng], 16); // Close zoom for driving view
    } else {
        btn.innerText = "🛰️ Follow Me";
        btn.style.backgroundColor = "#28a745";
    }
};

// Feature 2: Clear active direction layers cleanly
window.clearActiveRoute = function() {
    routeLineGroup.clearLayers();
    map.setView([userLat, userLng], 13);
};

window.drawRouteTo = function(categoryKey) {
    routeLineGroup.clearLayers(); 
    
    const targetPlace = currentNearestData[categoryKey];
    if (!targetPlace) {
        alert("No valid target coordinates loaded for this category yet!");
        return;
    }

    const apiKey = "AIzaSyArTg8qjhDRXbk_r3Hbgne3TxQdWi0KXLQ";
    const googleDirectionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${userLat},${userLng}&destination=${targetPlace.lat},${targetPlace.lng}&mode=driving&key=${apiKey}`;
    const proxyUrl = `https://corsproxy.io/?` + encodeURIComponent(googleDirectionsUrl);

    fetch(proxyUrl)
        .then(response => response.json())
        .then(data => {
            if (data.status === "OK" && data.routes.length > 0) {
                const points = decodeGooglePolyline(data.routes[0].overview_polyline.points);
                
                const roadLine = L.polyline(points, {
                    color: '#0070f3',
                    weight: 6,
                    opacity: 0.8,
                    lineJoin: 'round'
                }).addTo(routeLineGroup);

                // If follow mode is off, fit bounds so you can see the whole trip overview
                if (!isFollowMode) {
                    map.fitBounds(roadLine.getBounds(), { padding: [50, 50] });
                }
            } else {
                console.warn("Google Directions failed:", data.status);
                alert("Could not calculate road route.");
            }
        })
        .catch(err => console.error("Error drawing road layout route:", err));
};

function decodeGooglePolyline(encoded) {
    let points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

function updateLocation(position) {
    userLat = position.coords.latitude;
    userLng = position.coords.longitude;

    if (userMarker) {
        userMarker.setLatLng([userLat, userLng]);
    } else {
        const userIcon = L.divIcon({ 
            className: 'custom-pin pin-user',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map)
            .bindPopup("<b>Your Location</b>").openPopup();
        map.setView([userLat, userLng], 13);
    }

    // Dynamic Tracking view controller lock
    if (isFollowMode) {
        map.panTo([userLat, userLng]);
    }

    fetchNearbyAmenities(userLat, userLng);
}

function fetchNearbyAmenities(lat, lng) {
    if (lat === undefined || lng === undefined || lat === 0 || lng === 0) {
        return; 
    }

    if (lastFetchedLat !== 0 && lastFetchedLng !== 0) {
        const movementDistance = map.distance([lat, lng], [lastFetchedLat, lastFetchedLng]);
        if (movementDistance < MIN_MOVEMENT_METRES) {
            return;
        }
    }

    lastFetchedLat = lat;
    lastFetchedLng = lng;
    
    poiLayerGroup.clearLayers();

    let nearestItems = {
        medical: { name: "None found", dist: Infinity },
        police: { name: "None found", dist: Infinity },
        fuel: { name: "None found", dist: Infinity }
    };

    const radius = 30000; 
    const apiKey = "AIzaSyArTg8qjhDRXbk_r3Hbgne3TxQdWi0KXLQ";
    
    const categories = [
        { type: 'hospital', key: 'medical', color: 'pin-hospital' },
        { type: 'police', key: 'police', color: 'pin-police' },
        { type: 'gas_station', key: 'fuel', color: 'pin-fuel' }
    ];

    const requests = categories.map(cat => {
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${cat.type}&key=${apiKey}`;
        const proxyUrl = `https://corsproxy.io/?` + encodeURIComponent(googleUrl);
        
        return fetch(proxyUrl)
            .then(response => response.json())
            .then(data => {
                if (data && data.results) {
                    data.results.forEach(place => {
                        if (!place.geometry || !place.geometry.location) return;

                        const latPos = place.geometry.location.lat;
                        const lngPos = place.geometry.location.lng;
                        const name = place.name || "Unnamed Location";
                        
                        const currentDistance = map.distance([lat, lng], [latPos, lngPos]);

                        if (currentDistance < nearestItems[cat.key].dist) {
                            nearestItems[cat.key] = { name: name, dist: currentDistance };
                            currentNearestData[cat.key] = { lat: latPos, lng: lngPos, name: name };
                        }

                        const amenityIcon = L.divIcon({
                            className: `custom-pin ${cat.color}`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        L.marker([latPos, lngPos], { icon: amenityIcon })
                            .addTo(poiLayerGroup)
                            .bindPopup(`<b>${name}</b><br>Source: Google Places Database`);
                    });

                    if (nearestItems[cat.key].dist !== Infinity) {
                        const storageKey = `hist_${cat.key}`;
                        const lastSavedName = localStorage.getItem(storageKey);
                        const activeNearestName = nearestItems[cat.key].name;

                        if (!lastSavedName) {
                            localStorage.setItem(storageKey, activeNearestName);
                        } else if (lastSavedName !== activeNearestName) {
                            localStorage.setItem(storageKey, `${lastSavedName} -> ${activeNearestName}`);
                        }
                    }
                }
            })
            .catch(error => console.error(`Error fetching ${cat.type}:`, error));
    });

    Promise.all(requests).then(() => {
        updateLegendUI(nearestItems, getHistory());
    });
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;