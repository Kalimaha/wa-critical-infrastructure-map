#!/usr/bin/env bash
# Idempotent AWS CLI v2 install for Cloud Agent environments and local machines.
set -euo pipefail

if command -v aws >/dev/null 2>&1; then
  aws --version
  exit 0
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$tmpdir/awscliv2.zip"
unzip -q "$tmpdir/awscliv2.zip" -d "$tmpdir"

if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  sudo "$tmpdir/aws/install" --update
else
  "$tmpdir/aws/install" --update
fi

aws --version
