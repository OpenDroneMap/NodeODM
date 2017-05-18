#!/bin/bash

# This file executes the post-processing steps for a task after a dataset 
# has been processed by OpenDroneMap. It generates derivative computations.
# 
# As a general rule, post-processing commands should never fail the task 
#(for example, if a point cloud could not be generated, the PotreeConverter 
# step will fail, but the script should still continue processing the rest and
# return a 0 code). The idea is to post-process as much as possible, knowing 
# that some parts might fail and that partial results should be returned in such cases.

if [ -z "$1" ]; then
	echo "Usage: $0 <projectPath>"
	exit 0
fi

# Switch to project path folder (data/<uuid>/)
cd "$(dirname "$0")/../$1"
echo "Postprocessing: $(pwd)"

# Generate Tiles
if hash gdal2tiles.py 2>/dev/null; then
	orthophoto_path="odm_orthophoto/odm_orthophoto.tif"

	if [ -e "$orthophoto_path" ]; then
		gdal2tiles.py -z 12-21 -n -w none $orthophoto_path orthophoto_tiles
	else
		echo "No orthophoto found at $orthophoto_path: will skip tiling"
	fi
else
	echo "gdal2tiles.py is not installed, will skip tiling"
fi

# Generate Potree point cloud (if PotreeConverter is available)
if hash PotreeConverter 2>/dev/null; then
	potree_input_path=""
	for path in "odm_georeferencing/odm_georeferenced_model.ply" \
				"opensfm/depthmaps/merged.ply" \
				"pmvs/recon0/models/option-0000.ply"; do
		if [ -e $path ]; then
			echo "Found suitable point cloud for PotreeConverter: $path"
			potree_input_path=$path
			break
		fi
	done

	if [ ! -z "$potree_input_path" ]; then
		PotreeConverter $potree_input_path -o potree_pointcloud
	else
		echo "Potree point cloud will not be generated (no suitable input files found)"
	fi
else
	echo "PotreeConverter is not installed, will skip generation of Potree point cloud"
fi

echo "Postprocessing: done (•̀ᴗ•́)و!"
exit 0