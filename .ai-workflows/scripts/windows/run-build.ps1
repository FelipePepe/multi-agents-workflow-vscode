#Requires -Version 5.1
# run-build.ps1 — Runs the build command detected for this project stack.

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = if ($env:WORKSPACE_ROOT) { $env:WORKSPACE_ROOT } else { (Get-Location).Path }
$LogDir        = Join-Path $WorkspaceRoot ".ai-workflows\logs"
$BuildLog      = Join-Path $LogDir "build.log"
$DetectScript  = Join-Path $ScriptDir "detect-stack.ps1"

function Log-Build {
    param([string]$Message)
    Write-Host "[run-build] $Message"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Run stack detection
# ---------------------------------------------------------------------------

if (-not (Test-Path $DetectScript)) {
    Write-Error "[run-build] ERROR: detect-stack.ps1 not found at $DetectScript"
    exit 1
}

Log-Build "Running stack detection..."
$env:WORKSPACE_ROOT = $WorkspaceRoot
$StackJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DetectScript 2>$null

# ---------------------------------------------------------------------------
# Parse JSON
# ---------------------------------------------------------------------------

try {
    $Stack = $StackJson | ConvertFrom-Json
} catch {
    Write-Error "[run-build] ERROR: Failed to parse stack detection JSON: $_"
    exit 1
}

$Primary  = $Stack.primary
$BuildCmd = $Stack.build_cmd

# ---------------------------------------------------------------------------
# Check build command
# ---------------------------------------------------------------------------

if (-not $BuildCmd) {
    Log-Build "No build command detected for stack '$Primary'. Skipping build."
    exit 0
}

# ---------------------------------------------------------------------------
# Verify marker file exists
# ---------------------------------------------------------------------------

$MarkerFound = $false

switch ($Primary) {
    "dotnet" {
        $marker = Get-ChildItem -Path $WorkspaceRoot -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in @(".csproj", ".sln") -and
                           $_.FullName -notmatch "node_modules" -and
                           $_.FullName -notmatch "\.git" } |
            Select-Object -First 1
        if ($marker) { $MarkerFound = $true }
    }
    "java-maven" {
        if (Test-Path (Join-Path $WorkspaceRoot "pom.xml")) { $MarkerFound = $true }
    }
    "java-gradle" {
        if ((Test-Path (Join-Path $WorkspaceRoot "build.gradle")) -or
            (Test-Path (Join-Path $WorkspaceRoot "build.gradle.kts"))) { $MarkerFound = $true }
    }
    "node" {
        if (Test-Path (Join-Path $WorkspaceRoot "package.json")) { $MarkerFound = $true }
    }
    "python" {
        if ((Test-Path (Join-Path $WorkspaceRoot "requirements.txt")) -or
            (Test-Path (Join-Path $WorkspaceRoot "pyproject.toml")) -or
            (Test-Path (Join-Path $WorkspaceRoot "setup.py"))) { $MarkerFound = $true }
    }
    default {
        $MarkerFound = $true
    }
}

if (-not $MarkerFound) {
    Log-Build "WARNING: Expected marker file for stack '$Primary' not found in workspace."
    Log-Build "Skipping build to avoid running an incorrect command."
    exit 0
}

# ---------------------------------------------------------------------------
# Run build command
# ---------------------------------------------------------------------------

Log-Build "Stack    : $Primary"
Log-Build "Command  : $BuildCmd"
Log-Build "Log file : $BuildLog"
Log-Build ""

$BuildExit = 0

try {
    # Run build command and tee output to log file
    $output = Invoke-Expression $BuildCmd 2>&1
    $BuildExit = $LASTEXITCODE
    $output | Tee-Object -FilePath $BuildLog
} catch {
    $BuildExit = 1
    $_.ToString() | Tee-Object -FilePath $BuildLog
}

Write-Host ""
if ($BuildExit -eq 0) {
    Log-Build "Build PASSED"
} else {
    Log-Build "Build FAILED (exit code $BuildExit)"
}

Log-Build "Log saved to: $BuildLog"
exit $BuildExit
