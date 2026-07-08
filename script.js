// Cache-bust trigger for GitHub sync engine

let map;
let userMarker;
let poiLayerGroup;
let legendContainer;
let routeLineGroup; // Layer to hold the active navigation route line
let userLat = 0;
let userLng = 0;

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
    routeLineGroup = L.layerGroup().addTo(map); // Init the route line layer

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

// Function to fetch historical closest records from browser memory storage
function getHistory() {
    return {
        medical: localStorage.getItem('hist_medical') || "None tracked yet",
        police: localStorage.getItem('hist_police') || "None tracked yet",
        fuel: localStorage.getItem('hist_fuel') || "None tracked yet"
    };
}

// Function to update the text labels inside our floating key container with Routing Hooks
function updateLegendUI(nearest, history = getHistory()) {
    const formatNearest = (item, keyName) => {
        if (!item || item.dist === Infinity) return `<br><small style="color: #888;">Scanning Google...</small>`;
        const distanceKM = (item.dist / 1000).toFixed(1);
        
        // Returns a clickable button element that triggers the route plotter instantly
        return `
            <br><small style="color: #444; font-weight: bold;">${item.name} (${distanceKM} km)</small>
            <br><button onclick="drawRouteTo('${keyName}')" style="margin-top:4px; padding:2px 6px; font-size:11px; background:#0051ff; color:white; border:none; border-radius:3px; cursor:pointer;">Show Route</button>
        `;
    };

    legendContainer.innerHTML = `
        <h4>Map Tracker</h4>
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

// Global scope function to plot vector routing paths across your map view canvas
window.drawRouteTo = function(categoryKey) {
    routeLineGroup.clearLayers(); // Wipe out any previously active visual routes
    
    const targetPlace = currentNearestData[categoryKey];
    if (!targetPlace) {
        alert("No valid target coordinates loaded for this category yet!");
        return;
    }

    // Set up a standard Leaflet polyline path connection array vector
    const pathCoordinates = [
        [userLat, userLng], 
        [targetPlace.lat, targetPlace.lng]
    ];

    const routeLine = L.polyline(pathCoordinates, {
        color: '#0070f3',
        weight: 5,
        opacity: 0.8,
        dashArray: '10, 10', // Creates a clean, modern navigation dashed look
        lineJoin: 'round'
    }).addTo(routeLineGroup);

    // Smoothly pan and zoom out to fit both your location and the destination marker perfectly
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
};

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

    map.panTo([userLat, userLng]);
    fetchNearbyAmenities(userLat, userLng);
}

function fetchNearbyAmenities(lat, lng) {
    if (lat === undefined || lng === undefined || lat === 0 || lng === 0) {
        console.log("Waiting for valid GPS coordinates before scanning Google...");
        return; 
    }

    if (lastFetchedLat !== 0 && lastFetchedLng !== 0) {
        const movementDistance = map.distance([lat, lng], [lastFetchedLat, lastFetchedLng]);
        if (movementDistance < MIN_MOVEMENT_METRES) {
            console.log(`User only moved ${movementDistance.toFixed(1)}m. Skipping Google API request to save quota.`);
            return;
        }
    }

    lastFetchedLat = lat;
    lastFetchedLng = lng;
    
    poiLayerGroup.clearLayers();
    routeLineGroup.clearLayers(); // Clear line automatically when moving far away

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
                            
                            // Map coordinates to our global handle variable for tracking lines
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

                    // HISTORICAL PERSISTENCE LOGIC
                    // If a valid location was found, compare it to update memory logs
                    if (nearestItems[cat.key].dist !== Infinity) {
                        const storageKey = `hist_${cat.key}`;
                        const lastSavedName = localStorage.getItem(storageKey);
                        const activeNearestName = nearestItems[cat.key].name;

                        // If the memory slot is empty or a different closer location is found, archive the previous one
                        if (!lastSavedName) {
                            localStorage.setItem(storageKey, activeNearestName);
                        } else if (lastSavedName !== activeNearestName) {
                            // Shuffle the old item into the history state and save the new master item
                            localStorage.setItem(storageKey, `${lastSavedName} (Archived) -> Now: ${activeNearestName}`);
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