#!/bin/bash
# src-tauri/android/ のカスタムファイルを gen/android/ にコピーする
# Androidビルド前に実行: ./src-tauri/android/sync.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GEN_DIR="$SCRIPT_DIR/../gen/android/app/src/main"
JAVA_DIR="$GEN_DIR/java/com/notedeck/desktop"

mkdir -p "$JAVA_DIR"

cp "$SCRIPT_DIR/MainActivity.kt" "$JAVA_DIR/MainActivity.kt"
cp "$SCRIPT_DIR/NotificationWorker.kt" "$JAVA_DIR/NotificationWorker.kt"
cp "$SCRIPT_DIR/AndroidManifest.xml" "$GEN_DIR/AndroidManifest.xml"

echo "Android custom files synced."
