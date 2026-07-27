FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU explicitly to avoid massive CUDA dependencies.
# The torch wheel is ~200MB; on some Docker/WSL2 network paths large transfers get
# silently corrupted in transit, and pip's own hash check can misattribute which
# package failed. Download each wheel with curl and verify its SHA-256 ourselves
# before handing it to pip, retrying the download (not just the install) until the
# bytes actually match the wheelhouse's published hash.
RUN set -u; \
    verify_download() { \
        url="$1"; expected_sha256="$2"; out="$3"; \
        for attempt in $(seq 1 8); do \
            rm -f "$out"; \
            curl -fL --http1.1 --retry 3 --retry-delay 2 -o "$out" "$url" || { \
                echo "curl failed for $out (attempt $attempt), retrying..." >&2; \
                sleep 2; continue; \
            }; \
            actual_sha256="$(sha256sum "$out" | cut -d' ' -f1)"; \
            if [ "$actual_sha256" = "$expected_sha256" ]; then return 0; fi; \
            echo "checksum mismatch for $out (attempt $attempt): expected $expected_sha256 got $actual_sha256" >&2; \
        done; \
        echo "failed to download $url with a matching checksum after 8 attempts" >&2; \
        return 1; \
    }; \
    verify_download "https://download.pytorch.org/whl/cpu/torch-2.13.0%2Bcpu-cp311-cp311-manylinux_2_28_x86_64.whl" \
        "6746dbcbeb526eb61330b76b41ff1b4eb848951103a892eeb080dfa2b264667b" \
        "/tmp/torch-2.13.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl" || exit 1; \
    verify_download "https://download.pytorch.org/whl/cpu/torchvision-0.28.0%2Bcpu-cp311-cp311-manylinux_2_28_x86_64.whl" \
        "1dad604dfc0177ecebe0891bd9701fe2c62ec3f7819a247be541b3fb6effee99" \
        "/tmp/torchvision-0.28.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl" || exit 1; \
    pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
        /tmp/torch-2.13.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl \
        /tmp/torchvision-0.28.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl; \
    rm -f /tmp/torch-2.13.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl /tmp/torchvision-0.28.0+cpu-cp311-cp311-manylinux_2_28_x86_64.whl

# Copy and install requirements in cacheable layers
COPY requirements-core.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 120 -r requirements-core.txt

COPY requirements-anpr.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 120 -r requirements-anpr.txt

COPY . .
EXPOSE 8000
CMD ["python", "daemon.py"]
