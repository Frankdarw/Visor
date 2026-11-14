$ErrorActionPreference = "Stop"
$sourceResults = Join-Path $PSScriptRoot "resultados"
$publicData = Join-Path $PSScriptRoot "public\data"

if (-not (Test-Path -LiteralPath $sourceResults)) {
    throw "No existe '$sourceResults'. Ejecuta primero: python analizar_ciudades.py"
}

New-Item -ItemType Directory -Path $publicData -Force | Out-Null
Copy-Item -Path (Join-Path $sourceResults "*") -Destination $publicData -Recurse -Force
Write-Host "EarthScope data copied from resultados to public/data."
