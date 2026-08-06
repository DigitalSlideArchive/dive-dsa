#!/bin/bash
# Download SAM 3.1 checkpoints from Hugging Face when HF_TOKEN is available.
# Request access at https://huggingface.co/facebook/sam3.1 before building or running.

set -euo pipefail

MODEL_DIR="${SAM3_MODEL_DIR:-/opt/SAM3/models}"
ASSETS_DIR="${SAM3_ASSETS_DIR:-/opt/SAM3/assets}"
BPE_NAME="bpe_simple_vocab_16e6.txt.gz"
BPE_URL="https://raw.githubusercontent.com/facebookresearch/sam3/main/sam3/assets/${BPE_NAME}"

mkdir -p "$MODEL_DIR" "$ASSETS_DIR"

if [ ! -f "${ASSETS_DIR}/${BPE_NAME}" ]; then
    echo "Downloading SAM3 BPE tokenizer vocab to ${ASSETS_DIR}..."
    wget -q -O "${ASSETS_DIR}/${BPE_NAME}" "$BPE_URL"
    echo "SAM3 BPE vocab downloaded to ${ASSETS_DIR}/${BPE_NAME}"
fi

if [ -z "${HF_TOKEN:-}" ]; then
    echo "HF_TOKEN not set; skipping SAM 3.1 checkpoint download."
    echo "SAM 3.1 will download checkpoints at runtime if Hugging Face credentials are configured."
    exit 0
fi

if ! command -v hf &> /dev/null; then
    echo "hf CLI not found; install huggingface_hub to prefetch SAM 3.1 weights."
    exit 0
fi

hf download facebook/sam3.1 sam3.1_multiplex.pt config.json \
    --local-dir "$MODEL_DIR" \
    --token "$HF_TOKEN"
echo "SAM 3.1 checkpoints downloaded to $MODEL_DIR"
