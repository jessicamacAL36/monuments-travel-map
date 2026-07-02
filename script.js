// Cache-bust trigger for GitHub sync engine

let map;
let userMarker;
let poiLayerGroup;
let legendContainer;
let userLat = 0;
let userLng = 0;

function initMap() {
    map = L.map('map').setView([0, 0], 2);

    // Load Google Maps Roadmap base layer layout smoothly
    L.gridLayer.googleMutant({
        type: 'roadmap' 
    }).addTo(map);

    poiLayerGroup = L.layerGroup().addTo(map);

    // Initialise the floating map legend
    const legend = L.control({ position: 'topleft' });
    legend.onAdd = function () {
        legendContainer = L.DomUtil.create('div', 'map-legend');
        updateLegendUI({});
        return legendContainer;
    };
    legend.addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(updateLocation, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        });
    } else {
        alert("Geolocation tracking is not supported by this browser.");
    }
}

// Function to update the text labels inside our floating key container
function updateLegendUI(nearest) {
    const formatNearest = (item) => {
        if (!item || item.dist === Infinity) return `<br><small style="color: #888;">Scanning Google...</small>`;
        const distanceKM = (item.dist / 1000).toFixed(1);
        return `<br><small style="color: #444; font-weight: bold;">${item.name} (${distanceKM} km)</small>`;
    };

    legendContainer.innerHTML = `
        <h4>Map Key</h4>
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #ff68ae;"></span>Your Location</div>
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #dc3545;"></span>Emergency/Medical ${formatNearest(nearest.medical)}</div>
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #0051ff;"></span>Police Station ${formatNearest(nearest.police)}</div>
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #00ff0d;"></span>Petrol Station ${formatNearest(nearest.fuel)}</div>
    `;
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

    map.panTo([userLat, userLng]);
    fetchNearbyAmenities(userLat, userLng);
}

function fetchNearbyAmenities(lat, lng) {
    // SAFETY CHECK: If coordinates haven't loaded from the browser GPS yet, stop here and wait
    if (lat === undefined || lng === undefined || lat === 0 || lng === 0) {
        console.log("Waiting for valid GPS coordinates before scanning Google...");
        return; 
    }

    poiLayerGroup.clearLayers();

    // Initialise tracking structure
    let nearestItems = {
        medical: { name: "None found", dist: Infinity },
        police: { name: "None found", dist: Infinity },
        fuel: { name: "None found", dist: Infinity }
    };

    const radius = 30000; // 30km search radius

    const apiKey = "AIzaSyArTg8qjhDRXbk_r3Hbgne3TxQdWi0KXLQ";
    
    // Define the specific Google API type mapping strings
    const categories = [
        { type: 'hospital', key: 'medical', color: 'pin-hospital' },
        { type: 'police', key: 'police', color: 'pin-police' },
        { type: 'gas_station', key: 'fuel', color: 'pin-fuel' }
    ];

    // Create a list of individual network requests for each category
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
                        
                        const currentDistance = map.distance([userLat, userLng], [latPos, lngPos]);

                        // Track the single closest venue for the sidebar legend text tracking fields
                        if (currentDistance < nearestItems[cat.key].dist) {
                            nearestItems[cat.key] = { name: name, dist: currentDistance };
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
                }
            })
            .catch(error => console.error(`Error fetching ${cat.type}:`, error));
    });

    // Wait until all requests finish before updating the sidebar user interface text labels
    Promise.all(requests).then(() => {
        updateLegendUI(nearestItems);
    });
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;