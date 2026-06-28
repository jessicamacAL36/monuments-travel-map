let map;
let userMarker;
let poiLayerGroup;
let legendContainer;
let userLat = 0;
let userLng = 0;

function initMap() {
    map = L.map('map').setView([0, 0], 2);

    L.gridLayer.googleMutant({
        type: 'roadmap' 
    }).addTo(map);

    poiLayerGroup = L.layerGroup().addTo(map);

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

    // OPTIMISATION: Dropping to 10km (10000m) reduces the background database load significantly
    const radius = 10000; 
    const apiKey = "AIzaSyArTg8qjhDRXbk_r3Hbgne3TxQdWi0KXLQ";
    const types = ['hospital', 'police', 'gas_station', 'lodging', 'supermarket', 'convenience_store'];
    
    const targetUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&types=${types.join('|')}&key=${apiKey}`;
    const url = `https://cors-anywhere.herokuapp.com/${targetUrl}`;

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
                        .bindPopup(`<b>${name}</b><br>Source: Google Places`);
                });
                updateLegendUI(nearestItems);
            }
        })
        .catch(error => console.error("Error pulling Google Places data:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;