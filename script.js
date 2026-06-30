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

    // Your secure Apps Script macro URL
    const googleScriptUrl = "https://script.google.com/macros/s/AKfycbxXlLJkgbheDVEpDFb74fvJUuN8lzDKjo3MNU3XWPhZkvUwXXUvRlrj9Mb08uhtP3Nr/exec";
    const url = `${googleScriptUrl}?lat=${lat}&lng=${lng}`;

    // FIX: Added 'method' and 'redirect' configurations to handle Google Macro routing sequences perfectly
    fetch(url, {
        method: "GET",
        redirect: "follow"
    })
        .then(response => response.json())
        .then(data => {
            if (data && data.results) {
                data.results.forEach(place => {
                    if (!place.geometry || !place.geometry.location) return;

                    const latPos = place.geometry.location.lat;
                    const lngPos = place.geometry.location.lng;
                    const name = place.name || "Unnamed Location";
                    
                    let colourClass = ''; 
                    let categoryKey = '';
                    
                    if (place.types.includes('hospital') || place.types.includes('doctor') || place.types.includes('medical_device')) {
                        colourClass = 'pin-hospital';
                        categoryKey = 'medical';
                    } else if (place.types.includes('police')) {
                        colourClass = 'pin-police';
                        categoryKey = 'police';
                    } else if (place.types.includes('gas_station')) {
                        colourClass = 'pin-fuel';
                        categoryKey = 'fuel';
                    }

                    if (categoryKey && latPos && lngPos) {
                        const currentDistance = map.distance([userLat, userLng], [latPos, lngPos]);

                        if (currentDistance < nearestItems[categoryKey].dist) {
                            nearestItems[categoryKey] = { name: name, dist: currentDistance };
                        }

                        const amenityIcon = L.divIcon({
                            className: `custom-pin ${colourClass}`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        L.marker([latPos, lngPos], { icon: amenityIcon })
                            .addTo(poiLayerGroup)
                            .bindPopup(`<b>${name}</b><br>Source: Google Places Database`);
                    }
                });
                
                updateLegendUI(nearestItems);
            } else if (data && data.error) {
                console.error("Google API Server Error:", data.error);
            }
        })
        .catch(error => console.error("Network connection error:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;