# Backup Arena360 local file storage using a zip archive.
# Usage: .\scripts\backup-storage.ps1 [-SourceDir "path\to\uploads"] [-OutFile "path\to\backup.zip"]

param(
    [string]$SourceDir = "",
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

if (-not $SourceDir) {
    $SourceDir = Join-Path $repoRoot "uploads"
}

if (-not (Test-Path $SourceDir)) {
    throw "Source directory not found: $SourceDir"
}

if (-not $OutFile) {
    $backupDir = Join-Path $repoRoot "backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir | Out-Null
    }
    $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $OutFile = Join-Path $backupDir "uploads-$timestamp.zip"
}

$parentDir = Split-Path -Parent $OutFile
if (-not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir | Out-Null
}

if (Test-Path $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force
}

Compress-Archive -Path (Join-Path $SourceDir "*") -DestinationPath $OutFile
Write-Host "Storage backup written to: $OutFile"
