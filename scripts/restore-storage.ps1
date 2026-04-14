# Restore Arena360 local file storage from a zip archive.
# Usage: .\scripts\restore-storage.ps1 -ArchivePath "path\to\backup.zip" [-TargetDir "path\to\uploads-restore"]

param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,
    [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

if (-not (Test-Path $ArchivePath)) {
    throw "Archive not found: $ArchivePath"
}

if (-not $TargetDir) {
    $TargetDir = Join-Path $repoRoot "uploads-restore"
}

if (Test-Path $TargetDir) {
    Remove-Item -LiteralPath $TargetDir -Recurse -Force
}

New-Item -ItemType Directory -Path $TargetDir | Out-Null
Expand-Archive -LiteralPath $ArchivePath -DestinationPath $TargetDir -Force
Write-Host "Storage restored to: $TargetDir"
