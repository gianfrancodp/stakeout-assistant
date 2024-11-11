# stakeout-assistant
a simple Javascript project to convert from cartesian to polar coordinates in topographical surveys

# Survey Coordinate Converter

A web-based tool for surveyors to convert between coordinate systems and calculate polar coordinates with instrument and target height considerations. Built for *total station* surveying applications.

## Features

![flowchart](software_flowchart_v.2.svg)

### Input Handling

- CSV data import for survey points
- File upload support (.csv, .txt)
- Point data format: Name, X, Y, Z, Instrument/Target Height

### Coordinate Systems

- Cartesian (X, Y, Z) to Polar conversion
- Centesimal angle system (0-400ᵍ)
- Clockwise angle measurements from North
- Zenith angle calculations (100ᵍ at horizon)

### Height Considerations

- Instrument height input
- Target/prism height input
- Ground-to-instrument corrections
- Mean height calculations

### Distance Calculations

- Horizontal distance
- Spatial (3D) distance
- Sea level reduction
- Scale factor computation

### Angle Calculations

- Orientation azimuth (centesimal)
- Target azimuth (centesimal)
- Relative angles
- Vertical angles
- Zenith angles

## Usage

### Data Input

1. Enter point data in CSV format:
```
PointName,X,Y,Z,InstrumentHeight
ST1,1000.000,2000.000,100.000,1.600
ST2,1050.000,2050.000,101.500,1.600
```

2. Or upload a CSV/TXT file with the same format

### Setting Up a Measurement

1. Select station point (where total station is set up)
2. Select orientation point (reference for 0ᵍ)
3. Select target point (point to measure to)
4. Enter instrument height at station
5. Enter prism height at target
6. Click "Calculate" to get results

### Results

The tool provides:
- Distances (horizontal, spatial, sea level reduced)
- Angles in centesimal system (azimuth, relative, zenith)
- Height information and corrections
- Scale factor

## Technical Details

### Angle System

- Uses centesimal (gon/grad) system
- 400ᵍ = full circle
- 100ᵍ = right angle
- Clockwise measurement from North
- Zenith angle measured from vertical (100ᵍ at horizon)

### Formulas

#### Azimuth Calculation

```javascript
azimuthGon = (90° - arctan2(dy, dx)) * (400ᵍ/360°)
```

#### Zenith Angle

```javascript
zenithAngleGon = 100ᵍ - verticalAngleGon
```

#### Sea Level Reduction

```javascript
seaLevelDistance = measuredDistance * (earthRadius / (earthRadius + meanHeight))
```

### Height Corrections

- Station height added to station Z coordinate
- Target height added to target Z coordinate
- Heights considered in vertical angle calculations

## Installation

1. Clone the repository or download the HTML file
2. Open the HTML file in a web browser
3. No additional dependencies required

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Known Limitations

- Single file HTML/JavaScript implementation
- Client-side processing only
- Limited to manual data input or file upload
- No data persistence

## Contributing

Feel free to submit issues and enhancement requests or contribute to the development.

## License

see [LICENSE](LICENSE)file