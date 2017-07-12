#!/bin/bash

# This file executes the post-processing steps for a task after a dataset 
# has been processed by OpenDroneMap. It generates secondary outputs.
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
script_path=$(realpath $(dirname "$0"))
cd "$script_path/../$1"
echo "Postprocessing: $(pwd)"

# Generate colored shaded relief for DTM/DSM files if available
dem_products=()
if [ -e "odm_dem/dsm.tif" ]; then dem_products=(${dem_products[@]} dsm); fi
if [ -e "odm_dem/dtm.tif" ]; then dem_products=(${dem_products[@]} dtm); fi

if hash gdaldem 2>/dev/null; then
	for dem_product in ${dem_products[@]}; do
		dem_path="odm_dem/""$dem_product"".tif"

		gdaldem color-relief $dem_path $script_path/color_relief.txt "odm_dem/""$dem_product""_colored.tif" -alpha -co ALPHA=YES
		gdaldem hillshade $dem_path "odm_dem/""$dem_product""_hillshade.tif" -z 1.0 -s 1.0 -az 315.0 -alt 45.0
		python "$script_path/hsv_merge.py" "odm_dem/""$dem_product""_colored.tif" "odm_dem/""$dem_product""_hillshade.tif" "odm_dem/""$dem_product""_colored_hillshade.tif"
	done
else
	echo "gdaldem is not installed, will skip colored hillshade generation"
fi

# Generate Tiles
if hash gdal2tiles.py 2>/dev/null; then
	g2t_options="-z 12-21 -n -w none"
	orthophoto_path="odm_orthophoto/odm_orthophoto.tif"
	
	if [ -e "$orthophoto_path" ]; then
		gdal2tiles.py $g2t_options $orthophoto_path orthophoto_tiles
	else
		echo "No orthophoto found at $orthophoto_path: will skip tiling"
	fi

	for dem_product in ${dem_products[@]}; do
		colored_dem_path="odm_dem/""$dem_product""_colored_hillshade.tif"
		if [ -e "$colored_dem_path" ]; then
			gdal2tiles.py $g2t_options $colored_dem_path "$dem_product""_tiles"
		else
			echo "No $dem_product found at $colored_dem_path: will skip tiling"
		fi
	done
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

		# Copy the failsafe PLY point cloud to odm_georeferencing 
		# if necessary, otherwise it will not get zipped
		if [ "$potree_input_path" != "odm_georeferencing/odm_georeferenced_model.ply" ]; then
			echo "Copying $potree_input_path to odm_georeferencing/odm_georeferenced_model.ply, even though it's not georeferenced..."
			cp $potree_input_path "odm_georeferencing/odm_georeferenced_model.ply"
		fi
	else
		echo "Potree point cloud will not be generated (no suitable input files found)"
	fi
else
	echo "PotreeConverter is not installed, will skip generation of Potree point cloud"
fi

echo "Postprocessing: done (•̀ᴗ•́)و!"
exit 0
