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

# Generate point cloud (if entwine, untwine or potreeconverter is available)
pointcloud_input_path=""
for path in "odm_georeferencing/odm_georeferenced_model.laz" \
            "odm_georeferencing/odm_georeferenced_model.las" \
            "odm_filterpoints/point_cloud.ply" \
            "opensfm/depthmaps/merged.ply" \
            "smvs/smvs_dense_point_cloud.ply" \
            "mve/mve_dense_point_cloud.ply" \
            "pmvs/recon0/models/option-0000.ply"; do
    if [ -e $path ]; then
        echo "Found point cloud: $path"
        pointcloud_input_path=$path
        break
    fi
done

if [ ! -z "$pointcloud_input_path" ]; then
    # Convert the failsafe PLY point cloud to laz in odm_georeferencing 
    # if necessary, otherwise it will not get zipped
    if [ "$pointcloud_input_path" == "odm_filterpoints/point_cloud.ply" ] || [ "$pointcloud_input_path" == "opensfm/depthmaps/merged.ply" ] || [ "$pointcloud_input_path" == "pmvs/recon0/models/option-0000.ply" ]; then
        echo "Converting $pointcloud_input_path to odm_georeferencing/odm_georeferenced_model.laz, even though it's not georeferenced..."
        if hash pdal 2>/dev/null; then
            pdal translate -i "$pointcloud_input_path" -o "odm_georeferencing/odm_georeferenced_model.laz"
            if [ -e "odm_georeferencing/odm_georeferenced_model.laz" ]; then
                pointcloud_input_path="odm_georeferencing/odm_georeferenced_model.laz"
            fi
        else
            echo "Cannot find pdal, skipping conversion"
        fi
    fi
    

    if hash entwine 2>/dev/null; then
        if [ ! -e "entwine_pointcloud" ]; then
            entwine build --threads $(nproc) --tmp "entwine_pointcloud-tmp" -i "$pointcloud_input_path" -o entwine_pointcloud
        else
            echo "Entwine point cloud is already built."
        fi
        
        # Cleanup
        if [ -e "entwine_pointcloud-tmp" ]; then
            rm -fr "entwine_pointcloud-tmp"
        fi
    fi

    if hash untwine 2>/dev/null; then
        if [ ! -e "entwine_pointcloud" ]; then
            untwine --temp_dir "entwine_pointcloud-tmp" --files "$pointcloud_input_path" --output_dir entwine_pointcloud
        else
            echo "Entwine point cloud is already built."
        fi

        # Cleanup
        if [ -e "entwine_pointcloud-tmp" ]; then
            rm -fr "entwine_pointcloud-tmp"
        fi
    fi

    if [ ! -e "entwine_pointcloud" ]; then
        echo "Checking if PotreeConverter is available..."
        if hash PotreeConverter 2>/dev/null; then
            PotreeConverter "$pointcloud_input_path" -o potree_pointcloud --overwrite -a RGB CLASSIFICATION
        else
            echo "PotreeConverter is not installed, will skip generation of Potree point cloud"
        fi
    fi
else
    echo "Point cloud tiles will not be generated"
fi


echo "Postprocessing: done (•̀ᴗ•́)و!"
exit 0
