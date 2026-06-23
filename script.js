let map;
let userMarker;
let poiLayerGroup;
let legendContainer; // Reference to update the key box dynamically
let userLat = 0;
let userLng = 0;

function initMap() {
    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    poiLayerGroup = L.layerGroup().addTo(map);

    // Initialise the floating legend control
    const legend = L.control({ position: 'topleft' });
    legend.onAdd = function () {
        legendContainer = L.DomUtil.create('div', 'map-legend');
        // Initial placeholder state before data loads
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

// Separate function to render the legend text dynamically
function updateLegendUI(nearest) {
    const formatNearest = (item) => {
        if (!item || item.dist === Infinity) return `<br><small style="color: #888;">Scanning area...</small>`;
        // Convert metres to kilometres or miles (using km with 1 decimal place)
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

    // Object to track the closest item found during the API stream loop
    let nearestItems = {
        medical: { name: "None found", dist: Infinity },
        police: { name: "None found", dist: Infinity },
        fuel: { name: "None found", dist: Infinity },
        hotel: { name: "None found", dist: Infinity },
        shop: { name: "None found", dist: Infinity }
    };

    const radius = 30000; // 30km
    const query = `[out:json][timeout:25];
        (
          nw["amenity"="hospital"](around:${radius},${lat},${lng});
          nw["amenity"="pharmacy"](around:${radius},${lat},${lng});
          nw["amenity"="doctors"](around:${radius},${lat},${lng});
          nw["amenity"="clinic"](around:${radius},${lat},${lng});
          nw["amenity"="police"](around:${radius},${lat},${lng});
          nw["amenity"="fuel"](around:${radius},${lat},${lng});
          nw["tourism"="hotel"](around:${radius},${lat},${lng});
          nw["tourism"="guest_house"](around:${radius},${lat},${lng});
          nw["tourism"="hostel"](around:${radius},${lat},${lng});
          nw["shop"="supermarket"](around:${radius},${lat},${lng});
          nw["shop"="convenience"](around:${radius},${lat},${lng});
          nw["shop"="general"](around:${radius},${lat},${lng});
          nw["shop"="department_store"](around:${radius},${lat},${lng});
          nw["building"="retail"](around:${radius},${lat},${lng});
          nw["building"="supermarket"](around:${radius},${lat},${lng});
        );
        out center;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.elements) {
                data.elements.forEach(element => {
                    const latPos = element.lat || (element.center && element.center.lat);
                    const lngPos = element.lon || (element.center && element.center.lon);

                    if (latPos && lngPos) {
                        const name = element.tags.name || "Unnamed Location";
                        const type = element.tags.amenity || element.tags.tourism || element.tags.shop || element.tags.building || "location";
                        
                        let colourClass = 'pin-supermarket'; 
                        let categoryKey = 'shop';
                        
                        if (type === 'hospital' || type === 'doctors' || type === 'clinic') {
                            colourClass = 'pin-hospital';
                            categoryKey = 'medical';
                        } else if (type === 'police') {
                            colourClass = 'pin-police';
                            categoryKey = 'police';
                        } else if (type === 'fuel') {
                            colourClass = 'pin-fuel';
                            categoryKey = 'fuel';
                        } else if (type === 'hotel' || type === 'guest_house' || type === 'hostel') {
                            colourClass = 'pin-hotel';
                            categoryKey = 'hotel';
                        }

                        // Calculate exact distance between user and this item in metres
                        const currentDistance = map.distance([userLat, userLng], [latPos, lngPos]);

                        // Check if this item is closer than the previous closest one found
                        if (currentDistance < nearestItems[categoryKey].dist) {
                            nearestItems[categoryKey] = {
                                name: name,
                                dist: currentDistance
                            };
                        }

                        const amenityIcon = L.divIcon({
                            className: `custom-pin ${colourClass}`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        const formattedType = type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');

                        L.marker([latPos, lngPos], { icon: amenityIcon })
                            .addTo(poiLayerGroup)
                            .bindPopup(`<b>${name}</b><br>Category: ${formattedType}`);
                    }
                });

                // Update the floating map key text layout with the final nearest calculations
                updateLegendUI(nearestItems);
            }
        })
        .catch(error => console.error("Error pulling Overpass data:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;