#!/usr/bin/env bash
# Package the dialstack-docs skill into an upload-ready zip for the claude.ai /
# Cowork org-skill uploader (Settings -> Skills -> Organization skills -> Add).
#
# Only SKILL.md ships. README.md, this script, and the .claude-plugin/ adapter
# are excluded: the first two are dev scaffolding, and the third is meaningful
# only to Claude Code's marketplace installer, which is a different channel.
#
# Claude Code users do NOT need this -- they install from the marketplace and
# get updates by pulling. The zip is the only channel for claude.ai/Cowork,
# which has no marketplace, so an org owner must re-upload after changes.
#
# Usage: ./package.sh [output-dir]   (defaults to the current directory)
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_name="$(basename "$skill_dir")"
out_dir="$(cd "${1:-$PWD}" && pwd)"
out_zip="$out_dir/$skill_name.zip"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

mkdir "$staging/$skill_name"
cp "$skill_dir/SKILL.md" "$staging/$skill_name/"

rm -f "$out_zip"
(cd "$staging" && zip -qr "$out_zip" "$skill_name")

echo "Built $out_zip"
unzip -l "$out_zip"
