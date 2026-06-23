#Requires -Version 5.1
# detect-stack.ps1 — Detects the project stack from marker files.
# Outputs clean JSON to stdout; human-readable summary via Write-Host (stderr equivalent).

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = if ($env:WORKSPACE_ROOT) { $env:WORKSPACE_ROOT } else { (Get-Location).Path }
$LogDir = Join-Path $WorkspaceRoot ".ai-workflows\logs"
$LogFile = Join-Path $LogDir "stack-detection.json"

function Log-Info {
    param([string]$Message)
    Write-Host "[detect-stack] $Message"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

function Find-MarkerFiles {
    param(
        [string]$Root,
        [string[]]$Patterns,
        [int]$MaxDepth = 5
    )
    foreach ($pattern in $Patterns) {
        $results = Get-ChildItem -Path $Root -Filter $pattern -Recurse -ErrorAction SilentlyContinue |
            Where-Object {
                $_.FullName -notmatch [regex]::Escape((Join-Path $Root ".ai-workflows")) -and
                $_.FullName -notmatch "node_modules" -and
                $_.FullName -notmatch "\.git"
            } |
            Select-Object -First 1
        if ($results) { return $true }
    }
    return $false
}

# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

$Stacks = [System.Collections.Generic.List[string]]::new()

# dotnet
if (Find-MarkerFiles -Root $WorkspaceRoot -Patterns @("*.csproj", "*.sln")) {
    $Stacks.Add("dotnet")
    Log-Info "Detected: dotnet (.csproj / .sln)"
}

# java-maven
if (Find-MarkerFiles -Root $WorkspaceRoot -Patterns @("pom.xml")) {
    $Stacks.Add("java-maven")
    Log-Info "Detected: java-maven (pom.xml)"
}

# java-gradle
if (Find-MarkerFiles -Root $WorkspaceRoot -Patterns @("build.gradle", "build.gradle.kts")) {
    $Stacks.Add("java-gradle")
    Log-Info "Detected: java-gradle (build.gradle)"
}

# node — exclude .ai-workflows and node_modules
$nodeMarker = Get-ChildItem -Path $WorkspaceRoot -Filter "package.json" -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch [regex]::Escape((Join-Path $WorkspaceRoot ".ai-workflows")) -and
        $_.FullName -notmatch "node_modules" -and
        $_.FullName -notmatch "\.git"
    } |
    Select-Object -First 1

if ($nodeMarker) {
    $Stacks.Add("node")
    Log-Info "Detected: node (package.json)"
}

# python
if (Find-MarkerFiles -Root $WorkspaceRoot -Patterns @("requirements.txt", "pyproject.toml", "setup.py")) {
    $Stacks.Add("python")
    Log-Info "Detected: python (requirements.txt / pyproject.toml / setup.py)"
}

# sql
$sqlMarker = Get-ChildItem -Path $WorkspaceRoot -Filter "*.sql" -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch [regex]::Escape((Join-Path $WorkspaceRoot ".ai-workflows")) -and
        $_.FullName -notmatch "\.git"
    } |
    Select-Object -First 1

if ($sqlMarker) {
    $Stacks.Add("sql")
    Log-Info "Detected: sql (*.sql files)"
}

# generic fallback
if ($Stacks.Count -eq 0) {
    $Stacks.Add("generic")
    Log-Info "No specific stack detected — falling back to: generic"
}

# ---------------------------------------------------------------------------
# Primary stack selection
# ---------------------------------------------------------------------------

$PriorityOrder = @("dotnet", "java-maven", "java-gradle", "node", "python", "sql", "generic")
$Primary = "generic"

foreach ($candidate in $PriorityOrder) {
    if ($Stacks.Contains($candidate)) {
        $Primary = $candidate
        break
    }
}

# ---------------------------------------------------------------------------
# Commands per stack
# ---------------------------------------------------------------------------

$BuildCmd     = ""
$TestCmd      = ""
$LintCmd      = ""
$TypecheckCmd = ""

switch ($Primary) {
    "dotnet" {
        $BuildCmd = "dotnet build"
        $TestCmd  = "dotnet test"
    }
    "java-maven" {
        $BuildCmd = "mvn compile"
        $TestCmd  = "mvn test"
        $LintCmd  = "mvn checkstyle:check"
    }
    "java-gradle" {
        $BuildCmd = "./gradlew build"
        $TestCmd  = "./gradlew test"
        $LintCmd  = "./gradlew checkstyleMain"
    }
    "node" {
        $PkgJson = Join-Path $WorkspaceRoot "package.json"

        # Detect package manager
        $PM = "npm"
        if (Test-Path (Join-Path $WorkspaceRoot "pnpm-lock.yaml")) { $PM = "pnpm" }
        elseif (Test-Path (Join-Path $WorkspaceRoot "yarn.lock"))   { $PM = "yarn" }

        # Parse scripts from package.json if available
        if (Test-Path $PkgJson) {
            try {
                $pkg = Get-Content $PkgJson -Raw | ConvertFrom-Json
                if ($pkg.scripts.build)      { $BuildCmd     = "$PM run build"  }
                if ($pkg.scripts.test)       { $TestCmd      = "$PM test"       }
                if ($pkg.scripts.lint)       { $LintCmd      = "$PM run lint"   }
                if ($pkg.scripts.typecheck)  { $TypecheckCmd = "$PM run typecheck" }
                # Fallback typecheck if not in scripts
                if (-not $TypecheckCmd -and (Get-Command "npx" -ErrorAction SilentlyContinue)) {
                    $TypecheckCmd = "npx tsc --noEmit"
                }
            } catch {
                Log-Info "WARN: Could not parse package.json scripts. Using defaults."
                $BuildCmd     = "$PM run build"
                $TestCmd      = "$PM test"
                $LintCmd      = "$PM run lint"
                $TypecheckCmd = "npx tsc --noEmit"
            }
        } else {
            $BuildCmd     = "$PM run build"
            $TestCmd      = "$PM test"
            $LintCmd      = "$PM run lint"
            $TypecheckCmd = "npx tsc --noEmit"
        }
    }
    "python" {
        $TestCmd      = "python -m pytest"
        $LintCmd      = "python -m flake8"
        $TypecheckCmd = "python -m mypy ."
    }
    default {
        # sql / generic — no commands
    }
}

# ---------------------------------------------------------------------------
# Build JSON output
# ---------------------------------------------------------------------------

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Build stacks array string
$StacksJson = ($Stacks | ForEach-Object { "`"$_`"" }) -join ", "

$JsonOutput = @"
{
  "stacks": [$StacksJson],
  "primary": "$Primary",
  "build_cmd": "$BuildCmd",
  "test_cmd": "$TestCmd",
  "lint_cmd": "$LintCmd",
  "typecheck_cmd": "$TypecheckCmd",
  "detected_at": "$Timestamp"
}
"@

# Save to log file
$JsonOutput | Set-Content -Path $LogFile -Encoding UTF8
Log-Info "Stack detection saved to $LogFile"

# Human-readable summary
Log-Info "-------------------------------------------"
Log-Info "  Primary stack : $Primary"
Log-Info "  All stacks    : $($Stacks -join ', ')"
Log-Info "  Build         : $(if ($BuildCmd) { $BuildCmd } else { '<none>' })"
Log-Info "  Test          : $(if ($TestCmd) { $TestCmd } else { '<none>' })"
Log-Info "  Lint          : $(if ($LintCmd) { $LintCmd } else { '<none>' })"
Log-Info "  Typecheck     : $(if ($TypecheckCmd) { $TypecheckCmd } else { '<none>' })"
Log-Info "-------------------------------------------"

# Clean JSON to stdout
Write-Output $JsonOutput
