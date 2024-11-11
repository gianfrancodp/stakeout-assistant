
let points = [];
    
// Constants
const DEFAULT_EARTH_RADIUS = 6371000; // meters
const DEG_TO_GON = 400/360;  // Conversion factor from degrees to gon/centesimal
const GON_TO_DEG = 360/400;  // Conversion factor from gon/centesimal to degrees
const PI = Math.PI;

function loadPoints() {
    const input = document.getElementById('pointInput').value;
    points = [];

    const lines = input.trim().split('\n');
    for (const line of lines) {
        const [name, x, y, z, height] = line.split(',').map(val => val.trim());
        if (name && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
            points.push({
                name,
                x: parseFloat(x),
                y: parseFloat(y),
                z: parseFloat(z),
                height: height ? parseFloat(height) : 0
            });
        }
    }

    updateTable();
    updateSelects();
}

document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        document.getElementById('pointInput').value = e.target.result;
        loadPoints();
    };

    reader.readAsText(file);
});

// document.getElementById('stationPoint').addEventListener('change', updateStationHeight);

function updateTable() {
    const tbody = document.querySelector('#pointsTable tbody');
    tbody.innerHTML = '';

    points.forEach(point => {
        const row = tbody.insertRow();
        row.insertCell().textContent = point.name;
        row.insertCell().textContent = point.x.toFixed(3);
        row.insertCell().textContent = point.y.toFixed(3);
        row.insertCell().textContent = point.z.toFixed(3);
        row.insertCell().textContent = point.height ? point.height.toFixed(3) : "0.000";
    });
}

function updateSelects() {
    const stationSelect = document.getElementById('stationPoint');
    const orientSelect = document.getElementById('orientPoint');
    const targetSelect = document.getElementById('targetPoint');

    [stationSelect, orientSelect, targetSelect].forEach(select => {
        select.innerHTML = '';
        points.forEach(point => {
            const option = new Option(point.name, point.name);
            select.add(option);
        });
    });
}

function calculateAzimuth(fromPoint, toPoint) {
    const dx = toPoint.x - fromPoint.x;
    const dy = toPoint.y - fromPoint.y;
    // Calculate azimuth in radians from East (0°)
    let azimuthRad = Math.atan2(dy, dx);

    // Convert to degrees
    let azimuthDeg = azimuthRad * (180 / PI);

    // Convert to clockwise from North (90°)
    let azimuthFromNorth = (90 - azimuthDeg);

    // Normalize to 0-360 range
    if (azimuthFromNorth < 0) azimuthFromNorth += 360;

    // Convert to gon/centesimal
    let azimuthGon = azimuthFromNorth * DEG_TO_GON;

    return azimuthGon;
}

function normalizeAngle(angle) {
    // return ((angle % 400) + 400) % 400;
    while (angle < 0) angle += 400;
    while (angle >= 400) angle -= 400;
    return angle;
    
}

function reduceToSeaLevel(distance, meanHeight, earthRadius) {
    // Riduzione della distanza al livello del mare
    // Formula: D0 = D * (R / (R + h))
    // dove:
    // D0 = distanza ridotta al livello del mare
    // D = distanza misurata
    // R = raggio della Terra
    // h = quota media dei punti
    return distance * (earthRadius / (earthRadius + meanHeight));
}

function calculatePolar() {
    const stationName = document.getElementById('stationPoint').value;
    const orientName = document.getElementById('orientPoint').value;
    const targetName = document.getElementById('targetPoint').value;

    const station = points.find(p => p.name === stationName);
    const orient = points.find(p => p.name === orientName);
    const target = points.find(p => p.name === targetName);

    if (!station || !orient || !target) {
        alert('Please select all points');
        return;
    }

    // Get instrument and target heights
    // const stationHeight = parseFloat(document.getElementById('stationHeight').value);
    // const targetHeight = parseFloat(document.getElementById('targetHeight').value);
    
    const stationHeight = station.height;
    const targetHeight = target.height;

    // Get Earth radius in meters
    const earthRadius = parseFloat(document.getElementById('earthRadius').value) * 1000;

    // Calculate orientation azimuth
    const orientAzimuth = calculateAzimuth(station, orient);

    // Calculate target azimuth
    const targetAzimuth = calculateAzimuth(station, target);

    // Calculate relative azimuth
    const relativeAzimuth = normalizeAngle(targetAzimuth - orientAzimuth);
    // const relativeAzimuthFromZero = normalizeAngle(relativeAzimuth - orientAzimuth);

    // Calculate distances and vertical angle
    const dx = target.x - station.x;
    const dy = target.y - station.y;
    const dz = (target.z + targetHeight) - (station.z + stationHeight); // Add heights to Z coordinates

    const horizontalDistance = Math.sqrt(dx * dx + dy * dy);
    const totalDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Calculate vertical angle in centesimal
    const verticalAngleDeg = Math.atan2(dz, horizontalDistance) * (180 / PI);
    const verticalAngleGon = verticalAngleDeg * DEG_TO_GON;

    // Calculate zenith angle in centesimal (100g - vertical angle)
    const zenithAngleGon = 100 - verticalAngleGon;

    // Calculate mean height above sea level
    const meanHeight = (station.z + target.z) / 2;

    // Reduce horizontal distance to sea level
    const seaLevelDistance = reduceToSeaLevel(horizontalDistance, meanHeight, earthRadius);

    // Calculate scale factor
    const scaleFactor = seaLevelDistance / horizontalDistance;

    const result = document.getElementById('polarResult');
    result.innerHTML = `
        <strong>Results:</strong><br>
        <br>
        Station: ${station.name}<br>
        Orient: ${orient.name}<br>
        Target: ${target.name}<br>
        <br>
        <strong>Distances:</strong><br>
        Measured Horizontal Distance: ${horizontalDistance.toFixed(3)} meters<br>
        Sea Level Horizontal Distance: ${seaLevelDistance.toFixed(3)} meters<br>
        Total Spatial Distance: ${totalDistance.toFixed(3)} meters<br>
        Scale Factor: ${scaleFactor.toFixed(6)}<br>
        <br>
        <strong>Angles:</strong><br>
        Orientation Azimuth with North: ${orientAzimuth.toFixed(4)}ᵍ<br>
        Target Azimuth with North: ${targetAzimuth.toFixed(4)}ᵍ<br>
        Relative Azimuth: ${relativeAzimuth.toFixed(4)}ᵍ<br>
        Vertical Angle: ${verticalAngleGon.toFixed(4)}ᵍ<br>
        Zenith Angle: ${zenithAngleGon.toFixed(4)}ᵍ<br>
        <br>
        <strong>Heights:</strong><br>
        Station Ground Height: ${station.z.toFixed(3)} meters<br>
        Station Instrument Height: ${stationHeight.toFixed(3)} meters<br>
        Target Ground Height: ${target.z.toFixed(3)} meters<br>
        Target Prism Height: ${targetHeight.toFixed(3)} meters<br>
        Mean Ground Height: ${meanHeight.toFixed(3)} meters<br>
    `;
    
    const fieldbookdata = {station, target, relativeAzimuth, verticalAngleGon, totalDistance, targetHeight};

    //const tableBody = document.getElementById('pointsTable').getElementsByTagName('tbody')[0];
    const tbody = document.querySelector('#Field-book-Table tbody');
    // if (tableBody) {

        const row = tbody.insertRow();
        row.insertCell().textContent = fieldbookdata.station.name;
        row.insertCell().textContent = fieldbookdata.target.name;
        row.insertCell().textContent = fieldbookdata.relativeAzimuth.toFixed(4);
        row.insertCell().textContent = fieldbookdata.verticalAngleGon.toFixed(4);
        row.insertCell().textContent = fieldbookdata.totalDistance.toFixed(3);
        row.insertCell().textContent = fieldbookdata.targetHeight.toFixed(3);

        // const row = tableBody.insertRow();

        // const cell1 = row.insertCell(0);
        // cell1.textContent = fieldbookdata.station.name;
        

        // const cell2 = row.insertCell(1);
        // cell2.textContent = fieldbookdata.target.name;

        // const cell3 = row.insertCell(2);
        // cell3.textContent = fieldbookdata.targetAzimuth.toFixed(4);

        // const cell4 = row.insertCell(3);
        // cell4.textContent = fieldbookdata.verticalAngleGon.toFixed(4);

        // const cell5 = row.insertCell(4);
        // cell5.textContent = fieldbookdata.totalDistance.toFixed(3);

        // const cell6 = row.insertCell(5);
        // cell6.textContent = fieldbookdata.targetHeight.toFixed(3);
    // } else {
    //     console.error('Table body not found');
  }
