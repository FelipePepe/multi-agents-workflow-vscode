#Requires -Version 5.1
# run-tests.ps1 — Runs the test command detected for this project stack.

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = if ($env:WORKSPACE_ROOT) { $env:WORKSPACE_ROOT } else { (Get-Location).Path }
$LogDir        = Join-Path $WorkspaceRoot ".ai-workflows\logs"
$TestsLog      = Join-Path $LogDir "tests.log"
$DetectScript  = Join-Path $ScriptDir "detect-stack.ps1"

function Log-Tests {
    param([string]$Message)
    Write-Host "[run-tests] $Message"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Run stack detection
# ---------------------------------------------------------------------------

if (-not (Test-Path $DetectScript)) {
    Write-Error "[run-tests] ERROR: detect-stack.ps1 not found at $DetectScript"
    exit 1
}

Log-Tests "Running stack detection..."
$env:WORKSPACE_ROOT = $WorkspaceRoot
$StackJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DetectScript 2>$null

# ---------------------------------------------------------------------------
# Parse JSON
# ---------------------------------------------------------------------------

try {
    $Stack = $StackJson | ConvertFrom-Json
} catch {
    Write-Error "[run-tests] ERROR: Failed to parse stack detection JSON: $_"
    exit 1
}

$Primary = $Stack.primary
$TestCmd = $Stack.test_cmd

# ---------------------------------------------------------------------------
# Check test command
# ---------------------------------------------------------------------------

if (-not $TestCmd) {
    Log-Tests "No test command detected for stack '$Primary'. Skipping tests."
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
    Log-Tests "WARNING: Expected marker file for stack '$Primary' not found in workspace."
    Log-Tests "Skipping tests to avoid running an incorrect command."
    exit 0
}

# ---------------------------------------------------------------------------
# Run test command
# ---------------------------------------------------------------------------

Log-Tests "Stack    : $Primary"
Log-Tests "Command  : $TestCmd"
Log-Tests "Log file : $TestsLog"
Log-Tests ""

$TestExit = 0

try {
    $output = Invoke-Expression $TestCmd 2>&1
    $TestExit = $LASTEXITCODE
    $output | Tee-Object -FilePath $TestsLog
} catch {
    $TestExit = 1
    $_.ToString() | Tee-Object -FilePath $TestsLog
}

Write-Host ""
if ($TestExit -eq 0) {
    Log-Tests "Tests PASSED"
} else {
    Log-Tests "Tests FAILED (exit code $TestExit)"
}

Log-Tests "Log saved to: $TestsLog"
exit $TestExit
