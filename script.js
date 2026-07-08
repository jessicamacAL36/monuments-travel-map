// Cache-bust trigger for GitHub sync engine

let map;
let userMarker;
let poiLayerGroup;
let legendContainer;
let routeLineGroup; 
let userLat = 0;
let userLng = 0;

// Navigation state variables
let isFollowMode = false; 
let prevLat = 0;
let prevLng = 0;

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
    map = L.map('map', {
        zoomControl: false // Hide default zoom buttons to look cleaner like mobile apps
    }).setView([0, 0], 2);

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
            maximumAge: 1000, // Faster tracking response for driving smooth updates
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

    legendContainer.innerHTML = `
        <h4>Map Tracker</h4>
        
        <div style="margin-bottom: 12px; background: #f4f4f4; padding: 6px; border-radius: 4px; display: flex; gap: 6px;">
            <button onclick="toggleFollowMode()" id="followBtn" style="flex: 1; padding: 4px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                ${isFollowMode ? '🛰️ Navigating' : '🛰️ Start Navigation'}
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

window.toggleFollowMode = function() {
    isFollowMode = !isFollowMode;
    const btn = document.getElementById('followBtn');
    const mapContainer = document.getElementById('map');
    
    if (isFollowMode) {
        btn.innerText = "🛰️ Navigating";
        btn.style.backgroundColor = "#17a2b8";
        
        // Apply 3D Perspective Tilt Matrix directly to the map viewport wrapper container
        mapContainer.classList.add('perspective-navigation');
        
        map.setView([userLat, userLng], 17); // Snug cockpit zoom level
    } else {
        btn.innerText = "🛰️ Start Navigation";
        btn.style.backgroundColor = "#28a745";
        mapContainer.classList.remove('perspective-navigation');
        resetMapRotation();
        map.setView([userLat, userLng], 13);
    }
};

window.clearActiveRoute = function() {
    routeLineGroup.clearLayers();
    if (isFollowMode) toggleFollowMode(); // Turn off navigation graphics automatically
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
                    color: '#00b0ff', // Vivid navigation cyan-blue color matches your screenshot layout
                    weight: 7,
                    opacity: 0.9,
                    lineJoin: 'round'
                }).addTo(routeLineGroup);

                if (!isFollowMode) {
                    map.fitBounds(roadLine.getBounds(), { padding: [50, 50] });
                }
            } else {
                console.warn("Google Directions failed:", data.status);
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
        // High visibility custom location arrow pointer shape setup
        const userIcon = L.divIcon({ 
            className: 'custom-pin pin-user active-nav-arrow',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map)
            .bindPopup("<b>Your Location</b>").openPopup();
        map.setView([userLat, userLng], 13);
    }

    if (isFollowMode) {
        // DYNAMIC HEADING CALCULATION
        // Compare current coordinates to previous positions to derive heading vectors
        if (prevLat !== 0 && prevLng !== 0) {
            const headingAngle = calculateHeading(prevLat, prevLng, userLat, userLng);
            rotateMapContainer(headingAngle);
        }
        
        // Keep camera locked ahead on target dot coordinates
        map.panTo([userLat, userLng], { animate: true, duration: 0.5 });
        
        prevLat = userLat;
        prevLng = userLng;
    }

    fetchNearbyAmenities(userLat, userLng);
}

// Math vector utility to derive heading degrees relative to true North
function calculateHeading(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const rLat1 = lat1 * Math.PI / 180;
    const rLat2 = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(rLat2);
    const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLng);
    
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// Rotates the map container so the route line always moves upward on the screen
function rotateMapContainer(heading) {
    const mapPane = document.querySelector('.leaflet-map-pane');
    if (mapPane) {
        // Invert the angle to match screen orientations
        mapPane.style.transform = `rotate(${-heading}deg)`;
        
        // Keep your pointer marker tracking straight forward
        const userArrow = document.querySelector('.active-nav-arrow');
        if (userArrow) {
            userArrow.style.transform = `rotate(${heading}deg)`;
        }
    }
}

function resetMapRotation() {
    const mapPane = document.querySelector('.leaflet-map-pane');
    if (mapPane) mapPane.style.transform = 'none';
}

function fetchNearbyAmenities(lat, lng) {
    if (lat === undefined || lng === undefined || lat === 0 || lng === 0) return; 

    if (lastFetchedLat !== 0 && lastFetchedLng !== 0) {
        const movementDistance = map.distance([lat, lng], [lastFetchedLat, lastFetchedLng]);
        if (movementDistance < MIN_MOVEMENT_METRES) return;
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