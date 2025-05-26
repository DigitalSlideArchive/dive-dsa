#!/bin/bash

# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.

# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

# Use either wget or curl to download the checkpoints
if command -v wget &> /dev/null; then
    CMD="wget -P /opt/SAM2/models"
elif command -v curl &> /dev/null; then
    CMD="curl -L -O /opt/SAM2/models"
else
    echo "Please install wget or curl to download the checkpoints."
    exit 1
fi

# Define the URLs for SAM 2 checkpoints
# SAM2_BASE_URL="https://dl.fbaipublicfiles.com/segment_anything_2/072824"
# sam2_hiera_t_url="${SAM2_BASE_URL}/sam2_hiera_tiny.pt"
# sam2_hiera_s_url="${SAM2_BASE_URL}/sam2_hiera_small.pt"
# sam2_hiera_b_plus_url="${SAM2_BASE_URL}/sam2_hiera_base_plus.pt"
# sam2_hiera_l_url="${SAM2_BASE_URL}/sam2_hiera_large.pt"

# Download each of the four checkpoints using wget
# echo "Downloading sam2_hiera_tiny.pt checkpoint..."
# $CMD $sam2_hiera_t_url || { echo "Failed to download checkpoint from $sam2_hiera_t_url"; exit 1; }

# echo "Downloading sam2_hiera_small.pt checkpoint..."
# $CMD $sam2_hiera_s_url || { echo "Failed to download checkpoint from $sam2_hiera_s_url"; exit 1; }

# echo "Downloading sam2_hiera_base_plus.pt checkpoint..."
# $CMD $sam2_hiera_b_plus_url || { echo "Failed to download checkpoint from $sam2_hiera_b_plus_url"; exit 1; }

# echo "Downloading sam2_hiera_large.pt checkpoint..."
# $CMD $sam2_hiera_l_url || { echo "Failed to download checkpoint from $sam2_hiera_l_url"; exit 1; }

# Define the URLs for SAM 2.1 checkpoints
SAM2p1_BASE_URL="https://dl.fbaipublicfiles.com/segment_anything_2/092824"
SAM2Config_BASE_URL="https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1"
sam2p1_hiera_t_url="${SAM2p1_BASE_URL}/sam2.1_hiera_tiny.pt"
sam2p1_hiera_s_url="${SAM2p1_BASE_URL}/sam2.1_hiera_small.pt"
sam2p1_hiera_b_plus_url="${SAM2p1_BASE_URL}/sam2.1_hiera_base_plus.pt"
sam2p1_hiera_l_url="${SAM2p1_BASE_URL}/sam2.1_hiera_large.pt"
sam2p1_hiera_t_config_url="${SAM2Config_BASE_URL}/sam2.1_hiera_t.yaml"
sam2p1_hiera_s_config_url="${SAM2Config_BASE_URL}/sam2.1_hiera_s.yaml"
sam2p1_hiera_b_plus_config_url="${SAM2Config_BASE_URL}/sam2.1_hiera_b+.yaml"
sam2p1_hiera_l_config_url="${SAM2Config_BASE_URL}/sam2.1_hiera_l.yaml"

# SAM 2.1 checkpoints
echo "Downloading sam2.1_hiera_tiny.pt checkpoint..."
$CMD $sam2p1_hiera_t_url || { echo "Failed to download checkpoint from $sam2p1_hiera_t_url"; exit 1; }

echo "Downloading sam2.1_hiera_small.pt checkpoint..."
$CMD $sam2p1_hiera_s_url || { echo "Failed to download checkpoint from $sam2p1_hiera_s_url"; exit 1; }

echo "Downloading sam2.1_hiera_base_plus.pt checkpoint..."
$CMD $sam2p1_hiera_b_plus_url || { echo "Failed to download checkpoint from $sam2p1_hiera_b_plus_url"; exit 1; }

echo "Downloading sam2.1_hiera_large.pt checkpoint..."
$CMD $sam2p1_hiera_l_url || { echo "Failed to download checkpoint from $sam2p1_hiera_l_url"; exit 1; }

echo "All checkpoints are downloaded successfully."

echo "Downloading sam2.1_hiera_tiny.yaml config..."
$CMD $sam2p1_hiera_t_config_url || { echo "Failed to download config from $sam2p1_hiera_t_config_url"; exit 1; }
echo "Downloading sam2.1_hiera_small.yaml config..."
$CMD $sam2p1_hiera_s_config_url || { echo "Failed to download config from $sam2p1_hiera_s_config_url"; exit 1; }
echo "Downloading sam2.1_hiera_base_plus.yaml config..."
$CMD $sam2p1_hiera_b_plus_config_url || { echo "Failed to download config from $sam2p1_hiera_b_plus_config_url"; exit 1; }
echo "Downloading sam2.1_hiera_large.yaml config..."
$CMD $sam2p1_hiera_l_config_url || { echo "Failed to download config from $sam2p1_hiera_l_config_url"; exit 1; }
echo "All configs are downloaded successfully."
