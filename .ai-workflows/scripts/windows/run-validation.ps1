#Requires -Version 5.1
# run-validation.ps1 — Full validation pipeline: build, tests, lint, typecheck.
# Generates .ai-workflows/logs/validation-summary.md

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = if ($env:WORKSPACE_ROOT) { $env:WORKSPACE_ROOT } else { (Get-Location).Path }
$LogDir        = Join-Path $WorkspaceRoot ".ai-workflows\logs"
$SummaryFile   = Join-Path $LogDir "validation-summary.md"
$DetectScript  = Join-Path $ScriptDir "detect-stack.ps1"
$BuildScript   = Join-Path $ScriptDir "run-build.ps1"
$TestsScript   = Join-Path $ScriptDir "run-tests.ps1"
$Timestamp     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

function Log-Val {
    param([string]$Message)
    Write-Host "[run-validation] $Message"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Status tracking
# ---------------------------------------------------------------------------

$BuildStatus     = "SKIPPED"
$TestStatus      = "SKIPPED"
$LintStatus      = "SKIPPED"
$TypecheckStatus = "SKIPPED"

# ---------------------------------------------------------------------------
# Step 1: Stack detection
# ---------------------------------------------------------------------------

if (-not (Test-Path $DetectScript)) {
    Write-Error "[run-validation] ERROR: detect-stack.ps1 not found at $DetectScript"
    exit 1
}

Log-Val "Step 1/4 - Stack detection"
$env:WORKSPACE_ROOT = $WorkspaceRoot
$StackJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DetectScript 2>$null

try {
    $Stack = $StackJson | ConvertFrom-Json
} catch {
    Write-Error "[run-validation] ERROR: Failed to parse stack detection JSON: $_"
    exit 1
}

$Primary      = $Stack.primary
$BuildCmd     = $Stack.build_cmd
$TestCmd      = $Stack.test_cmd
$LintCmd      = $Stack.lint_cmd
$TypecheckCmd = $Stack.typecheck_cmd

Log-Val "  Primary stack : $Primary"
Log-Val "  Build         : $(if ($BuildCmd) { $BuildCmd } else { '<none>' })"
Log-Val "  Test          : $(if ($TestCmd) { $TestCmd } else { '<none>' })"
Log-Val "  Lint          : $(if ($LintCmd) { $LintCmd } else { '<none>' })"
Log-Val "  Typecheck     : $(if ($TypecheckCmd) { $TypecheckCmd } else { '<none>' })"
Log-Val ""

# ---------------------------------------------------------------------------
# Step 2: Build
# ---------------------------------------------------------------------------

Log-Val "Step 2/4 - Build"

if (-not (Test-Path $BuildScript)) {
    Log-Val "  WARN: run-build.ps1 not found. Skipping build."
} else {
    $BuildExit = 0
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildScript
        $BuildExit = $LASTEXITCODE
    } catch {
        $BuildExit = 1
    }

    if ($BuildExit -eq 0) {
        $BuildStatus = "PASS"
        Log-Val "  Build: PASS"
    } else {
        $BuildStatus = "FAIL"
        Log-Val "  Build: FAIL (exit code $BuildExit)"
    }
}
Log-Val ""

# ---------------------------------------------------------------------------
# Step 3: Tests
# ---------------------------------------------------------------------------

Log-Val "Step 3/4 - Tests"

if (-not (Test-Path $TestsScript)) {
    Log-Val "  WARN: run-tests.ps1 not found. Skipping tests."
} else {
    $TestExit = 0
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TestsScript
        $TestExit = $LASTEXITCODE
    } catch {
        $TestExit = 1
    }

    if ($TestExit -eq 0) {
        $TestStatus = "PASS"
        Log-Val "  Tests: PASS"
    } else {
        $TestStatus = "FAIL"
        Log-Val "  Tests: FAIL (exit code $TestExit)"
    }
}
Log-Val ""

# ---------------------------------------------------------------------------
# Step 4a: Lint
# ---------------------------------------------------------------------------

Log-Val "Step 4/4 - Lint and Typecheck"

if (-not $LintCmd) {
    Log-Val "  No lint command detected. Skipping lint."
} else {
    $LintLog  = Join-Path $LogDir "lint.log"
    Log-Val "  Running lint: $LintCmd"
    $LintExit = 0
    try {
        $lintOutput = Invoke-Expression $LintCmd 2>&1
        $LintExit   = $LASTEXITCODE
        $lintOutput | Tee-Object -FilePath $LintLog
    } catch {
        $LintExit = 1
        $_.ToString() | Tee-Object -FilePath $LintLog
    }

    if ($LintExit -eq 0) {
        $LintStatus = "PASS"
        Log-Val "  Lint: PASS"
    } else {
        $LintStatus = "FAIL"
        Log-Val "  Lint: FAIL (exit code $LintExit)"
    }
}

# ---------------------------------------------------------------------------
# Step 4b: Typecheck
# ---------------------------------------------------------------------------

if (-not $TypecheckCmd) {
    Log-Val "  No typecheck command detected. Skipping typecheck."
} else {
    $TypecheckLog  = Join-Path $LogDir "typecheck.log"
    Log-Val "  Running typecheck: $TypecheckCmd"
    $TypecheckExit = 0
    try {
        $tcOutput      = Invoke-Expression $TypecheckCmd 2>&1
        $TypecheckExit = $LASTEXITCODE
        $tcOutput | Tee-Object -FilePath $TypecheckLog
    } catch {
        $TypecheckExit = 1
        $_.ToString() | Tee-Object -FilePath $TypecheckLog
    }

    if ($TypecheckExit -eq 0) {
        $TypecheckStatus = "PASS"
        Log-Val "  Typecheck: PASS"
    } else {
        $TypecheckStatus = "FAIL"
        Log-Val "  Typecheck: FAIL (exit code $TypecheckExit)"
    }
}

Log-Val ""

# ---------------------------------------------------------------------------
# Overall result
# ---------------------------------------------------------------------------

$Overall = "PASS"
foreach ($s in @($BuildStatus, $TestStatus, $LintStatus, $TypecheckStatus)) {
    if ($s -eq "FAIL") {
        $Overall = "FAIL"
        break
    }
}

# ---------------------------------------------------------------------------
# Generate validation-summary.md
# ---------------------------------------------------------------------------

$SummaryContent = @"
# Validation Summary

**Date:** $Timestamp
**Stack:** $Primary

| Check | Status | Log |
|-------|--------|-----|
| Build | $BuildStatus | .ai-workflows/logs/build.log |
| Tests | $TestStatus | .ai-workflows/logs/tests.log |
| Lint | $LintStatus | .ai-workflows/logs/lint.log |
| Typecheck | $TypecheckStatus | .ai-workflows/logs/typecheck.log |

**Overall: $Overall**
"@

$SummaryContent | Set-Content -Path $SummaryFile -Encoding UTF8

# ---------------------------------------------------------------------------
# Print summary to stdout
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "========================================"
Write-Host " Validation Summary"
Write-Host "========================================"
Write-Host " Date      : $Timestamp"
Write-Host " Stack     : $Primary"
Write-Host " Build     : $BuildStatus"
Write-Host " Tests     : $TestStatus"
Write-Host " Lint      : $LintStatus"
Write-Host " Typecheck : $TypecheckStatus"
Write-Host "----------------------------------------"
Write-Host " Overall   : $Overall"
Write-Host "========================================"
Write-Host ""
Write-Host "Full summary written to: $SummaryFile"
Write-Host ""

# ---------------------------------------------------------------------------
# Exit code
# ---------------------------------------------------------------------------

if ($Overall -eq "PASS") {
    exit 0
} else {
    exit 1
}
