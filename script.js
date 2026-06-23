let map;
let userMarker;
let poiLayerGroup;

// 1. Initialise the map with a default global fallback view
function initMap() {
    map = L.map('map').setView([0, 0], 2);

    // Load and display free OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Create a dedicated layer group so we can easily clear old amenity markers
    poiLayerGroup = L.layerGroup().addTo(map);

    // 2. Activate the live real-time laptop tracking loop
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

// 3. This triggers automatically whenever your laptop's location changes
function updateLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // Update or create your personal position marker pin
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        const userIcon = L.divIcon({className: 'custom-pin pin-user' });
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup("<b>Your Laptop Location</b>").openPopup();
        // Push view closer to user on first capture
        map.setView([lat, lng], 14);
    }

    // Move map frame focus to center on user
    map.panTo([lat, lng]);

    // Query for nearby amenities around your new coordinates
    fetchNearbyAmenities(lat, lng);
}

// 4. Fetch infrastructure from the free global Overpass API
function fetchNearbyAmenities(lat, lng) {
    // Clear old pins first so they don't pile up as you travel
    poiLayerGroup.clearLayers();

    // Define search radius (30 kms) and infrastructure tags
    const radius = 30000;
    const query = `[out:json][timeout:25];
        (
          node["amenity"="hospital"](around:${radius},${lat},${lng});
          node["amenity"="police"](around:${radius},${lat},${lng});
          node["amenity"="fuel"](around:${radius},${lat},${lng});
          node["tourism"="hotel"](around:${radius},${lat},${lng});
          node["shop"="supermarket"](around:${radius},${lat},${lng});
        );
        out body;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.elements) {
                data.elements.forEach(element => {
                    if (element.lat && element.lon) {
                        // Gather name information if available, fallback otherwise
                        const name = element.tags.name || "Unnamed Facility";
                        const type = element.tags.amenity || element.tags.tourism || element.tags.shop || "Facility";

                        let colourClass = 'pin-supermarket'; // default fallback
                        if (type === 'hospital') colourClass = 'pin-hospital';
                        if (type === 'police') colourClass = 'pin-police';
                        if (type === 'fuel') colourClass = 'pin-fuel';
                        if (type === 'hotel') colourClass = 'pin-hotel';

                        // Create custom icon element
                        const amenityIcon = L.divIcon({
                            className: `custom-pin ${colourClass}`
                        });
                        
                        // Capitalise first letter of type
                        const formattedType = type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');

                        // Plot pins into layer group
                        L.marker([element.lat, element.lon])
                            .addTo(poiLayerGroup)
                            .bindPopup(`<b>${name}</b><br>Type: ${formattedType}`);
                    }
                });
            }
        })
        .catch(error => console.error("Error pulling Overpass data:", error));
}

function handleLocationError(error) {
    console.warn(`Geolocation error (${error.code}): ${error.message}`);
}

// Start the whole application loop on page load
window.onload = initMap;