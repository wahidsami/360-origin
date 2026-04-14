# Smoke-test the Arena360 API by checking key unauthenticated operational endpoints.
# Usage: .\scripts\smoke-api.ps1 -BaseUrl "http://localhost:3010"

param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [int]$TimeoutSeconds = 15
)

$ErrorActionPreference = "Stop"

function Invoke-SmokeCheck {
    param(
        [string]$Path,
        [int]$ExpectedStatus = 200
    )

    $uri = ($BaseUrl.TrimEnd('/') + $Path)
    $response = Invoke-WebRequest -Uri $uri -TimeoutSec $TimeoutSeconds -UseBasicParsing
    if ($response.StatusCode -ne $ExpectedStatus) {
        throw "Unexpected status code for $uri. Expected $ExpectedStatus, got $($response.StatusCode)."
    }
    return $response
}

$health = Invoke-SmokeCheck -Path '/api/health'
$ready = Invoke-SmokeCheck -Path '/api/ready'

if ($health.Content -notmatch '"status"\s*:\s*"ok"') {
    throw 'Health check payload did not report status ok.'
}

if ($ready.Content -notmatch '"status"\s*:\s*"ready"') {
    throw 'Readiness check payload did not report status ready.'
}

Write-Host "Smoke test passed for $BaseUrl"
