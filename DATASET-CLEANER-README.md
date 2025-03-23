# Dataset Cleaner Tool

A simple tool for visualizing and cleaning image dataset pairs. This tool allows you to quickly browse through image pairs in a dataset folder, mark low-quality images for deletion, and permanently remove them from your file system.

## Features

- Browse through thousands of image pairs with fast navigation
- View images side-by-side with zoom capability
- Mark poor quality images (blurry, foggy, etc.) for deletion 
- Permanently delete marked pairs directly from the file system
- Export a list of pairs marked for deletion (if you prefer manual deletion)
- Persistent tracking of deleted pairs between sessions

## Usage Instructions

1. Open `dataset-cleaner.html` in a modern browser (Chrome/Edge recommended)
2. Click "Select Dataset Folder" and choose your dataset folder containing pair subfolders
3. The tool will scan the folder and load all valid image pairs
4. Browse through the pairs using the navigation buttons or by clicking on items in the list
5. Use the "Delete Pair" button to mark low-quality pairs (those with fog, blur, etc.)
6. To check image details, click directly on the image to zoom
7. When you've marked all pairs you want to remove:
   - Click "Permanently Delete Files" to remove them from your file system (this can't be undone!)
   - Or click "Export Deleted List" to save a JSON file with deleted pair information for manual processing

## Data Structure Requirements

This tool expects a dataset folder with the following structure:

```
dataset_folder/
├── pair_1_[coordinates]/
│   ├── view1.jpg
│   ├── view2.jpg
│   ├── debug.jpg (optional)
│   └── metadata.json
├── pair_2_[coordinates]/
│   ├── view1.jpg
│   ├── view2.jpg
│   └── ...
└── ...
```

Each pair subfolder must contain:
- `view1.jpg` - First view image
- `view2.jpg` - Second view image
- `debug.jpg` - (Optional) Debug view showing both images side by side
- `metadata.json` - (Optional) Metadata for the pair

## Browser Requirements

- This tool requires a browser that supports the File System Access API
- Currently supported in: Chrome, Edge, and other Chromium-based browsers
- Not supported in: Firefox, Safari

## Notes

- When you mark pairs for deletion, they're initially only flagged in the tool, not actually removed
- The list of marked pairs is stored in your browser's localStorage and persists between sessions
- You can either:
  - Use the "Permanently Delete Files" button to directly remove the files from your system
  - Or export the list and handle deletion separately using your own scripts/tools
- The permanent deletion uses the File System Access API and directly removes files from disk
- **Warning**: Permanent deletion cannot be undone, so use with caution