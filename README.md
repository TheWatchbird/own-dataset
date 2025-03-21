# Drone View Point Matching

A visualization tool for matching the same physical points captured by drones from different perspectives.

## Project Specifications & Requirements

### Overview
This project demonstrates how to visualize the same 3D points seen from two different drone camera perspectives. It uses Cesium for 3D globe rendering and shows connecting lines between matching points in the two views.

### Core Requirements

1. **Dual View Display**
   - Two side-by-side Cesium viewers showing different drone perspectives
   - Each viewer represents a different drone camera angle viewing the same area
   - Both views must be synchronized to the same geographic location

2. **Point Matching**
   - At least 5 points must be matched between the two views
   - Each matching point must represent the exact same physical 3D point seen from both perspectives
   - Points must be visually connected with lines between the views
   - Points should be numbered to make the correspondence clear
   - Red markers for points in View 1, green markers for points in View 2

3. **Camera Positioning**
   - Drones positioned at different angles (ideally opposite sides)
   - Both drones should be looking at the same target area
   - Camera positions must guarantee overlapping views to enable point matching
   - Camera height approximately 150-300m above ground

4. **User Interface**
   - "Generate New Views" button to create new drone perspectives
   - Clear visual indication of matched points with numbered markers
   - Location information displayed for context
   - Simple, clean interface without distracting elements

5. **Technical Requirements**
   - Must work with Cesium.js 1.112 or later
   - No dependencies on advanced Cesium features that might not be available
   - Fully client-side implementation (no server-side processing)
   - Reliable point matching that always works
   - No fallback to center points - actual matching of physical points

### Optional Features

1. **Different Imagery Options**
   - Support for different map providers for each view (if available)
   - Visual distinction between the two views

2. **Export Capability**
   - Export dataset with matched points and camera information
   - Include screenshots of both views

3. **Debugging Information**
   - Debug panel showing number of matched points
   - Distance between drone positions
   - Camera height information

### Mathematical Approach

The core mathematical principle of this project is the projection of 3D points to 2D screen coordinates from different camera perspectives:

1. Define a set of 3D points in world coordinates
2. For each point:
   - Project the 3D point to View 1 using Camera 1's projection matrix
   - Project the same 3D point to View 2 using Camera 2's projection matrix
   - Draw a line connecting these projected 2D points
   - This line represents the same physical point as seen from two different perspectives

### Performance Considerations

- Minimize animations and transitions for better reliability
- Keep point count reasonable (5-10 points)
- Ensure clean visual separation between points
- Use direct camera positioning without complex camera path animations

## Implementation Notes

The current implementation uses a simplified approach that guarantees point matching works reliably. It positions two drone cameras on opposite sides of a target point, both looking at the same target from different angles. It then projects a fixed pattern of 5 points to both views and draws connecting lines between the matching projections.

For use in real-world applications with actual drone footage, this concept would need to be extended with computer vision techniques to automatically identify and match points between images.