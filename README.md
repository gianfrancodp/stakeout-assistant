# stakeout-assistant
a simple Javascript project to convert from cartesian to polar coordinates in topographical surveys

# Survey Coordinate Converter - Cassini-Soldner Projection

This project is a web-based application that assists with converting geographic coordinates into survey coordinates using the Cassini-Soldner projection. The application provides tools for calculating projection parameters, including grid and geodetic values, azimuth, and scale factors.

## Features

- **Input Fields**: Users can input parameters such as origin latitude, origin longitude, semi-major axis, and flattening.
- **Cassini-Soldner Projection**: Compute coordinates based on the Cassini-Soldner projection, including grid azimuth and distance.
- **Geodetic Calculations**: Output geodetic distance and azimuth, corrected for sea level and meridian convergence.
- **Interactive User Interface**: Simple form layout with labels, inputs, and result displays for easy navigation.

## Project Structure

- `index.html`: Contains the HTML structure of the app, including input forms, settings grid, and result display.
- `style`: Embedded CSS in the HTML file provides styling for elements like `.container`, `.info-box`, and `.settings-grid`.
- `script`: JavaScript functions for calculations, including conversion between degrees and radians, and computing Cassini-Soldner parameters.

## Getting Started

To run the project, open `index.html` in a web browser. This will load the form interface where users can enter their data and calculate the coordinates.

### Prerequisites

This project is standalone and only requires a modern web browser with JavaScript enabled.

## Usage

1. **Input the following parameters**:
   - **Origin Latitude (φ₀)** and **Origin Longitude (λ₀)**: The origin coordinates for the Cassini-Soldner projection.
   - **Semi-major Axis (a)**: Typically set to the WGS 84 value (6378137 meters).
   - **Flattening (1/f)**: Define the flattening, e.g., `298.257223563`.

2. **Run the Calculation**: Press a button (if provided) to calculate projection parameters and distances.

3. **Output**: The app displays calculated values for:
   - Grid and Geodetic distances
   - Azimuth (grid and geodesic)
   - Meridian Convergence
   - Scale Factor
   - Sea Level Distance

## Code Structure

### Key JavaScript Functions

- `toRadians(degrees)`: Converts degrees to radians.
- `toDegrees(radians)`: Converts radians to degrees.
- `computeMeridianConvergence(E, N, phi0, a, e2)`: Calculates meridian convergence based on inputs.
- `computeScaleFactor(E, phi0, a, e2)`: Computes the scale factor for given coordinates.
- `calculateCassiniSoldner()`: Main function that gathers user inputs, performs calculations, and outputs results.

### HTML Elements

- **Settings Grid**: The `.settings-grid` class creates a grid layout for labels and input fields.
- **Results Display**: The `.result` div is used to show calculation outputs.

### Note

Ensure that you define:
- `points` array containing station, orient, and target points.
- `reduceToSeaLevel` function to complete sea level distance calculations.

## Example

Sample inputs for typical survey parameters:
- Origin Latitude: `0.0000`
- Origin Longitude: `0.0000`
- Semi-major axis (a): `6378137`
- Flattening (1/f): `298.257223563`

After entering these values, click "Calculate" to view Cassini-Soldner projection results.

