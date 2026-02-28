#!/bin/bash
# Build the NanoClaw Betty agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-betty"
TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-container}"

echo "Building Betty agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" -f Dockerfile.betty .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"Hello!\",\"groupFolder\":\"betty-friend\",\"chatJid\":\"test@g.us\",\"isMain\":false,\"secrets\":{\"QWEN_API_BASE\":\"http://192.168.65.1:11434/v1\",\"QWEN_MODEL\":\"qwen3.5\"}}' | ${CONTAINER_RUNTIME} run -i ${IMAGE_NAME}:${TAG}"
