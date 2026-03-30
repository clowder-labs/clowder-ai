param(
    [string]$ProjectRoot,
    [string]$ManifestPath,
    [string]$PythonExe,
    [string[]]$Group = @(),
    [switch]$ForceReinstall,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WheelhouseDefaultProjectRoot {
    $candidate = Join-Path $PSScriptRoot ".."
    return [System.IO.Path]::GetFullPath($candidate)
}

function Resolve-WheelhouseManifestPath {
    param(
        [string]$ResolvedProjectRoot,
        [string]$RequestedPath
    )

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidates = @(
        (Join-Path $ResolvedProjectRoot "installer-seed\python-wheelhouse-manifest.json"),
        (Join-Path $ResolvedProjectRoot "packaging\windows\python-wheelhouse-manifest.json"),
        (Join-Path $ResolvedProjectRoot "dist\windows-python-wheelhouse\python-wheelhouse-manifest.json")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw "python wheelhouse manifest not found; pass -ManifestPath explicitly"
}

function Resolve-WheelhousePythonExe {
    param(
        [string]$ResolvedProjectRoot,
        [string]$RequestedPath
    )

    if ($RequestedPath) {
        return [System.IO.Path]::GetFullPath($RequestedPath)
    }

    $candidate = Join-Path $ResolvedProjectRoot "tools\python\python.exe"
    if (-not (Test-Path $candidate)) {
        throw "python.exe not found; pass -PythonExe explicitly"
    }
    return [System.IO.Path]::GetFullPath($candidate)
}

function ConvertTo-WheelhouseArray {
    param($Value)

    if ($null -eq $Value) {
        return @()
    }
    if ($Value -is [System.Array]) {
        return @($Value)
    }
    return @($Value)
}

function ConvertFrom-WheelhouseJson {
    param([string]$JsonText)

    $convertFromJson = Get-Command ConvertFrom-Json -ErrorAction Stop
    if ($convertFromJson.Parameters.ContainsKey("Depth")) {
        return $JsonText | ConvertFrom-Json -Depth 100
    }
    return $JsonText | ConvertFrom-Json
}

function Get-WheelhouseSelectedGroups {
    param(
        $Manifest,
        [string[]]$RequestedGroups
    )

    $groups = @(ConvertTo-WheelhouseArray $Manifest.groups)
    if ($groups.Length -eq 0) {
        throw "wheelhouse manifest contains no groups"
    }

    if (-not $RequestedGroups -or @($RequestedGroups).Length -eq 0) {
        return $groups
    }

    $selected = @()
    foreach ($groupId in $RequestedGroups) {
        $match = $groups | Where-Object { "$($_.id)" -eq $groupId } | Select-Object -First 1
        if (-not $match) {
            throw "wheelhouse group not found in manifest: $groupId"
        }
        $selected += $match
    }
    return $selected
}

function Get-WheelhouseLocalProjectInstalls {
    param($Group)

    $projects = @(ConvertTo-WheelhouseArray $Group.localProjects)
    if ($projects.Length -eq 0) {
        return @()
    }

    $installs = @()
    foreach ($project in $projects) {
        $projectWheelFiles = @(ConvertTo-WheelhouseArray $project.wheelFiles)
        if ($projectWheelFiles.Length -eq 0) {
            continue
        }
        $installs += [pscustomobject]@{
            path = "$($project.path)"
            wheelArgs = @(ConvertTo-WheelhouseArray $project.wheelArgs)
            wheelFiles = $projectWheelFiles
        }
    }
    return $installs
}

function Invoke-WheelhouseInstallGroup {
    param(
        [string]$PythonExePath,
        [string]$ManifestDir,
        $Group,
        [switch]$ForceReinstall,
        [switch]$DryRun
    )

    $wheelSubdir = "$($Group.wheelSubdir)"
    if (-not $wheelSubdir) {
        throw "wheelhouse group $($Group.id) missing wheelSubdir"
    }

    $wheelDir = [System.IO.Path]::GetFullPath((Join-Path $ManifestDir $wheelSubdir))
    if (-not (Test-Path $wheelDir)) {
        throw "wheelhouse directory not found for group $($Group.id): $wheelDir"
    }

    $localProjectInstalls = @(Get-WheelhouseLocalProjectInstalls -Group $Group)
    $localProjectWheelFileSet = @{}
    foreach ($localProject in $localProjectInstalls) {
        foreach ($localWheelFile in @($localProject.wheelFiles)) {
            $localProjectWheelFileSet["$localWheelFile"] = $true
        }
    }

    $wheelFiles = @(ConvertTo-WheelhouseArray $Group.wheelFiles)
    if ($wheelFiles.Length -eq 0) {
        throw "wheelhouse group $($Group.id) has no wheel files"
    }

    $wheelPaths = @()
    foreach ($wheelFile in $wheelFiles) {
        if ($localProjectWheelFileSet.ContainsKey("$wheelFile")) {
            continue
        }
        $wheelPath = Join-Path $wheelDir "$wheelFile"
        if (-not (Test-Path $wheelPath)) {
            throw "wheel file missing for group $($Group.id): $wheelPath"
        }
        $wheelPaths += [System.IO.Path]::GetFullPath($wheelPath)
    }

    $requirementsFile = $null
    try {
        $pipArgs = @(
            "-m", "pip", "install",
            "--no-index",
            "--find-links", $wheelDir,
            "--no-warn-script-location"
        )
        if ($ForceReinstall) {
            $pipArgs += "--force-reinstall"
        }

        Write-Host "[wheelhouse] installing group $($Group.id) from $wheelDir"
        if ($wheelPaths.Length -gt 0) {
            $requirementsFile = [System.IO.Path]::GetTempFileName()
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($requirementsFile, ($wheelPaths -join [Environment]::NewLine), $utf8NoBom)

            $groupInstallArgs = @($pipArgs + @("-r", $requirementsFile))
            if ($DryRun) {
                Write-Host "[wheelhouse] dry-run: $PythonExePath $($groupInstallArgs -join ' ')"
            } else {
                & $PythonExePath @groupInstallArgs
                if ($LASTEXITCODE -ne 0) {
                    throw "pip install failed for group $($Group.id)"
                }
            }
        }

        foreach ($localProject in $localProjectInstalls) {
            $projectWheelPaths = @()
            foreach ($projectWheelFile in @($localProject.wheelFiles)) {
                $projectWheelPath = Join-Path $wheelDir "$projectWheelFile"
                if (-not (Test-Path $projectWheelPath)) {
                    throw "wheel file missing for local project $($localProject.path): $projectWheelPath"
                }
                $projectWheelPaths += [System.IO.Path]::GetFullPath($projectWheelPath)
            }

            $projectInstallArgs = @($pipArgs)
            if ($localProject.wheelArgs -contains "--no-deps") {
                $projectInstallArgs += "--no-deps"
            }
            $projectInstallArgs += $projectWheelPaths

            if ($DryRun) {
                Write-Host "[wheelhouse] dry-run local project $($localProject.path): $PythonExePath $($projectInstallArgs -join ' ')"
                continue
            }

            & $PythonExePath @projectInstallArgs
            if ($LASTEXITCODE -ne 0) {
                throw "pip install failed for local project $($localProject.path) in group $($Group.id)"
            }
        }
    } finally {
        if ($requirementsFile) {
            Remove-Item $requirementsFile -Force -ErrorAction SilentlyContinue
        }
    }
}

$resolvedProjectRoot = if ($ProjectRoot) {
    [System.IO.Path]::GetFullPath($ProjectRoot)
} else {
    Resolve-WheelhouseDefaultProjectRoot
}

$resolvedManifestPath = Resolve-WheelhouseManifestPath -ResolvedProjectRoot $resolvedProjectRoot -RequestedPath $ManifestPath
$resolvedPythonExe = Resolve-WheelhousePythonExe -ResolvedProjectRoot $resolvedProjectRoot -RequestedPath $PythonExe

if (-not (Test-Path $resolvedManifestPath)) {
    throw "wheelhouse manifest not found: $resolvedManifestPath"
}
if (-not (Test-Path $resolvedPythonExe)) {
    throw "python.exe not found: $resolvedPythonExe"
}

$manifestRaw = Get-Content -Path $resolvedManifestPath -Raw -Encoding UTF8
$manifest = ConvertFrom-WheelhouseJson -JsonText $manifestRaw
$manifestDir = Split-Path -Parent $resolvedManifestPath
$selectedGroups = Get-WheelhouseSelectedGroups -Manifest $manifest -RequestedGroups $Group

foreach ($selectedGroup in $selectedGroups) {
    Invoke-WheelhouseInstallGroup `
        -PythonExePath $resolvedPythonExe `
        -ManifestDir $manifestDir `
        -Group $selectedGroup `
        -ForceReinstall:$ForceReinstall `
        -DryRun:$DryRun
}

Write-Host "[wheelhouse] install complete"
