#!/usr/bin/env bash
# Copy generated PMTiles to the bucket root. Does not delete other objects,
# so existing road, boundary, and police archives stay in place.
set -euo pipefail

bucket="s3://wa-critical-infrastructure-map"
region="${AWS_DEFAULT_REGION:-ap-southeast-2}"
dir="data/processed"
files=(
  DFES_Stations.pmtiles
  DFES_Response_Coverage.pmtiles
)

for name in "${files[@]}"; do
  path="${dir}/${name}"
  if [[ ! -f "${path}" ]]; then
    echo "Skipping ${name} (${path} not found)"
    continue
  fi
  echo "Uploading ${name}"
  aws s3 cp "${path}" "${bucket}/${name}" --region "${region}" --content-type application/octet-stream
done
