param([switch]$SkipDesktop)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepositoryRoot
try {
    & "$RepositoryRoot\BiliPocketReader\build-userscript.ps1"
    & node "$PSScriptRoot\verify-js.cjs"
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript verification failed.' }

    if (-not $SkipDesktop) {
        & dotnet build tests\GIFcut.Tests\GIFcut.Tests.csproj --configuration Release
        if ($LASTEXITCODE -ne 0) { throw 'GIFcut build failed.' }
        & dotnet run --project tests\GIFcut.Tests\GIFcut.Tests.csproj --configuration Release --no-build
        if ($LASTEXITCODE -ne 0) { throw 'GIFcut regression checks failed.' }
    }
} finally {
    Pop-Location
}
