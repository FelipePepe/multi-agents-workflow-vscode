#Requires -Version 5.1
# ollama-check-models.ps1 — Checks required Ollama models are available locally.
# Usage: .\ollama-check-models.ps1 [-Pull]

[CmdletBinding()]
param(
    [switch]$Pull
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = if ($env:WORKSPACE_ROOT) { $env:WORKSPACE_ROOT } else { (Get-Location).Path }
$LogDir    = Join-Path $WorkspaceRoot ".ai-workflows\logs"
$ConfigFile = Join-Path $WorkspaceRoot ".ai-workflows\config\models.json"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Required models — from config file if available, else hardcoded
# ---------------------------------------------------------------------------

$RequiredModels = @()

if (Test-Path $ConfigFile) {
    try {
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($config.required_models -and $config.required_models.Count -gt 0) {
            $RequiredModels = $config.required_models
        }
    } catch {
        Write-Host "[ollama-check] WARN: Could not parse $ConfigFile. Using hardcoded defaults."
    }
}

if ($RequiredModels.Count -eq 0) {
    $RequiredModels = @(
        "qwen3.6:35b-a3b",
        "qwen3-coder-next",
        "deepseek-r1:70b",
        "devstral-small-2",
        "north-mini-code-1.0",
        "qwen2.5-coder:32b"
    )
}

# ---------------------------------------------------------------------------
# Check ollama is installed
# ---------------------------------------------------------------------------

$ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue

if (-not $ollamaCmd) {
    Write-Host ""
    Write-Error "ERROR: ollama is not installed or not in PATH."
    Write-Host ""
    Write-Host "Installation instructions:"
    Write-Host "  Windows  : https://ollama.com/download/windows"
    Write-Host "  Linux    : curl -fsSL https://ollama.com/install.sh | sh"
    Write-Host "  macOS    : https://ollama.com/download"
    Write-Host "  Manual   : https://ollama.com/download"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "=== Ollama Model Check ==="
Write-Host "Required models: $($RequiredModels.Count)"
Write-Host ""

# ---------------------------------------------------------------------------
# Get list of available models
# ---------------------------------------------------------------------------

$ollamaListOutput = ""
try {
    $ollamaListOutput = & ollama list 2>&1 | Out-String
} catch {
    Write-Error "ERROR: Failed to run 'ollama list': $_"
    exit 1
}

# ---------------------------------------------------------------------------
# Check each model
# ---------------------------------------------------------------------------

$PresentModels = [System.Collections.Generic.List[string]]::new()
$MissingModels = [System.Collections.Generic.List[string]]::new()

foreach ($model in $RequiredModels) {
    # Parse model name and tag
    $parts     = $model -split ":", 2
    $modelName = $parts[0]
    $modelTag  = if ($parts.Count -gt 1) { $parts[1] } else { $null }

    $found = $false
    if ($null -eq $modelTag) {
        # No tag — match any tag for this model name
        if ($ollamaListOutput -match "(?m)^$([regex]::Escape($modelName))(:[^\s]+)?\s") {
            $found = $true
        }
    } else {
        # Exact name:tag match
        if ($ollamaListOutput -match "(?m)^$([regex]::Escape($modelName)):$([regex]::Escape($modelTag))\s") {
            $found = $true
        }
    }

    if ($found) {
        $PresentModels.Add($model)
        Write-Host "  [OK]      $model"
    } else {
        $MissingModels.Add($model)
        Write-Host "  [MISSING] $model"
    }
}

Write-Host ""

# ---------------------------------------------------------------------------
# Handle missing models
# ---------------------------------------------------------------------------

if ($MissingModels.Count -gt 0) {
    if ($Pull) {
        Write-Host "Pulling $($MissingModels.Count) missing model(s)..."
        Write-Host ""
        $PullFailures = [System.Collections.Generic.List[string]]::new()

        foreach ($model in $MissingModels) {
            Write-Host "  Pulling: $model"
            try {
                & ollama pull $model
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  [OK] $model pulled successfully."
                } else {
                    Write-Host "  [ERROR] Failed to pull $model (exit code $LASTEXITCODE)."
                    $PullFailures.Add($model)
                }
            } catch {
                Write-Host "  [ERROR] Exception pulling $model : $_"
                $PullFailures.Add($model)
            }
            Write-Host ""
        }

        if ($PullFailures.Count -gt 0) {
            Write-Host "ERROR: Failed to pull $($PullFailures.Count) model(s):"
            foreach ($m in $PullFailures) {
                Write-Host "  - $m"
            }
            Write-Host ""
        }
    } else {
        Write-Host "To pull the missing models, run:"
        Write-Host ""
        foreach ($model in $MissingModels) {
            Write-Host "  ollama pull $model"
        }
        Write-Host ""
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

$Total   = $RequiredModels.Count
$Present = $PresentModels.Count

Write-Host "=== Summary ==="
Write-Host "  $Present/$Total models available"
Write-Host ""

if ($MissingModels.Count -gt 0) {
    Write-Host "  Missing models:"
    foreach ($m in $MissingModels) {
        Write-Host "    - $m"
    }
    Write-Host ""
    exit 1
}

Write-Host "All required models are available."
Write-Host ""
exit 0
