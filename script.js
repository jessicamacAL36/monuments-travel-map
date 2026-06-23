let map;
let userMarker;
let poiLayerGroup;

function initMap() {
    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    poiLayerGroup = L.layerGroup().addTo(map);

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

function updateLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        const userIcon = L.divIcon({ 
            className: 'custom-pin pin-user',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map)
            .bindPopup("<b>Your Location</b>").openPopup();
        map.setView([lat, lng], 13);
    }

    map.panTo([lat, lng]);
    fetchNearbyAmenities(lat, lng);
}

function fetchNearbyAmenities(lat, lng) {
    poiLayerGroup.clearLayers();

    const radius = 30000; // 30km
    
    // UPGRADED QUERY: Using 'nw' to find dots AND drawn building outlines
    const query = `[out:json][timeout:25];
        (
          nw["amenity"="hospital"](around:${radius},${lat},${lng});
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
        out center;`; // 'out center' forces building shapes to report a clean center point coordinate

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.elements) {
                data.elements.forEach(element => {
                    // Use center coordinates for building shapes, or normal coordinates for standard dots
                    const latPos = element.lat || (element.center && element.center.lat);
                    const lngPos = element.lon || (element.center && element.center.lon);

                    if (latPos && lngPos) {
                        const name = element.tags.name || "Unnamed Location";
                        const type = element.tags.amenity || element.tags.tourism || element.tags.shop || element.tags.building || "location";
                        
                        let colourClass = 'pin-supermarket'; 
                        
                        if (type === 'hospital' || type === 'doctors' || type === 'clinic') {
                            colourClass = 'pin-hospital';
                        } else if (type === 'police') {
                            colourClass = 'pin-police';
                        } else if (type === 'fuel') {
                            colourClass = 'pin-fuel';
                        } else if (type === 'hotel' || type === 'guest_house' || type === 'hostel') {
                            colourClass = 'pin-hotel';
                        } else {
                            colourClass = 'pin-supermarket';
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
            }
        })
        .catch(error => console.error("Error pulling Overpass data:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

window.onload = initMap;