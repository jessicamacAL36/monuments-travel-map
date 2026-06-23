let map;
let userMarker;
let poiLayerGroup;

function initMap() {
    // Initialise the map container focusing globally first
    map = L.map('map').setView([0, 0], 2);

    // Render free global OpenStreetMap background map layouts
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Grouping container to clear out markers dynamically when location changes
    poiLayerGroup = L.layerGroup().addTo(map);

    // Build the dynamic floating key map legend in top-left frame
    const legend = L.control({ position: 'topleft' });

    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <h4>Map Key</h4>
            <div><span class="legend-key" style="background-color: #ff68ae;"></span>Your Location</div>
            <div><span class="legend-key" style="background-color: #dc3545;"></span>Emergency/Medical</div>
            <div><span class="legend-key" style="background-color: #0051ff;"></span>Police Station</div>
            <div><span class="legend-key" style="background-color: #00ff0d;"></span>Petrol Station</div>
            <div><span class="legend-key" style="background-color: #6f42c1;"></span>Hotels & B&Bs</div>
            <div><span class="legend-key" style="background-color: #ffee00;"></span>Shops & Stores</div>
        `;
        return div;
    };
    legend.addTo(map);

    // Initialise browser native geolocation watching stream
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

// Triggers automatically whenever your laptop GPS coordinates update
function updateLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // Create or move your custom pink location dot marker pin
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        const userIcon = L.divIcon({ 
            className: 'custom-pin pin-user',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map)
            .bindPopup("<b>Your Laptop Location</b>").openPopup();
        
        // Push view frame closer to coordinates on first capture
        map.setView([lat, lng], 13);
    }

    map.panTo([lat, lng]);
    fetchNearbyAmenities(lat, lng);
}

// Queries the live crowdsourced open database up to a 30km radius
function fetchNearbyAmenities(lat, lng) {
    poiLayerGroup.clearLayers();

    const radius = 30000; // Expanded to 30km for rural coverage
    const query = `[out:json][timeout:25];
        (
          node["amenity"="hospital"](around:${radius},${lat},${lng});
          node["amenity"="doctors"](around:${radius},${lat},${lng});
          node["amenity"="clinic"](around:${radius},${lat},${lng});
          node["amenity"="police"](around:${radius},${lat},${lng});
          node["amenity"="fuel"](around:${radius},${lat},${lng});
          node["tourism"="hotel"](around:${radius},${lat},${lng});
          node["tourism"="guest_house"](around:${radius},${lat},${lng});
          node["shop"="supermarket"](around:${radius},${lat},${lng});
          node["shop"="convenience"](around:${radius},${lat},${lng});
          node["shop"="general"](around:${radius},${lat},${lng});
          node["shop"="department_store"](around:${radius},${lat},${lng});
          node["building"="retail"](around:${radius},${lat},${lng});
        );
        out body;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.elements) {
                data.elements.forEach(element => {
                    if (element.lat && element.lon) {
                        const name = element.tags.name || "Unnamed Facility";
                        const type = element.tags.amenity || element.tags.tourism || element.tags.shop || "facility";
                        
                        let colourClass = 'pin-supermarket'; // Fallback
                        
                        // Map the incoming tags to your updated custom pin class colours
                        if (type === 'hospital' || type === 'doctors' || type === 'clinic') {
                            colourClass = 'pin-hospital';
                        } else if (type === 'police') {
                            colourClass = 'pin-police';
                        } else if (type === 'fuel') {
                            colourClass = 'pin-fuel';
                        } else if (type === 'hotel' || type === 'guest_house') {
                            colourClass = 'pin-hotel';
                        } else if (type === 'supermarket' || type === 'convenience' || type === 'general' || type === 'department_store' || type === 'retail') {
                            colourClass = 'pin-supermarket';
                        }

                        const amenityIcon = L.divIcon({
                            className: `custom-pin ${colourClass}`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });

                        const formattedType = type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');

                        L.marker([element.lat, element.lon], { icon: amenityIcon })
                            .addTo(poiLayerGroup)
                            .bindPopup(`<b>${name}</b><br>Category: ${formattedType}`);
                    }
                });
            }
        })
        .catch(error => console.error("Error pulling Overpass data:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;