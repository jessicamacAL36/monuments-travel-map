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
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #6f42c1;"></span>Hotels & B&Bs ${formatNearest(nearest.hotel)}</div>
        <div style="margin-bottom: 8px;"><span class="legend-key" style="background-color: #ffee00;"></span>Shops & Stores ${formatNearest(nearest.shop)}</div>
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
    poiLayerGroup.clearLayers();

    let nearestItems = {
        medical: { name: "None found", dist: Infinity },
        police: { name: "None found", dist: Infinity },
        fuel: { name: "None found", dist: Infinity },
        hotel: { name: "None found", dist: Infinity },
        shop: { name: "None found", dist: Infinity }
    };

    // Linked to your secure Google Apps Script background macro proxy endpoint
    const googleScriptUrl = "https://script.google.com/macros/s/AKfycbxXlLJkgbheDVEpDFb74fvJUuN8lzDKjo3MNU3XWPhZkvUwXXUvRlrj9Mb08uhtP3Nr/exec";
    const url = `${googleScriptUrl}?lat=${lat}&lng=${lng}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.results) {
                data.results.forEach(place => {
                    const latPos = place.geometry.location.lat;
                    const lngPos = place.geometry.location.lng;
                    const name = place.name;
                    
                    let colourClass = 'pin-supermarket'; 
                    let categoryKey = 'shop';
                    
                    // Match Google Places returned category tags to map coloured marker sets
                    if (place.types.includes('hospital') || place.types.includes('doctor')) {
                        colourClass = 'pin-hospital';
                        categoryKey = 'medical';
                    } else if (place.types.includes('police')) {
                        colourClass = 'pin-police';
                        categoryKey = 'police';
                    } else if (place.types.includes('gas_station')) {
                        colourClass = 'pin-fuel';
                        categoryKey = 'fuel';
                    } else if (place.types.includes('lodging')) {
                        colourClass = 'pin-hotel';
                        categoryKey = 'hotel';
                    }

                    // Calculate straight-line tracking distance using Leaflet engine framework
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
                        .bindPopup(`<b>${name}</b><br>Source: Google Places via Apps Script`);
                });
                updateLegendUI(nearestItems);
            }
        })
        .catch(error => console.error("Error pulling data from Google Apps Script:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;