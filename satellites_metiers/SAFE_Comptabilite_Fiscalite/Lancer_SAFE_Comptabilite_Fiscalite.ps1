param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$CoreErpDir = "C:\Users\USER\OneDrive\Desktop\SAFE_ERP_DRAFT 4\SAFE_Grandes_Entreprises"

if (-not (Test-Path -LiteralPath $CoreErpDir -PathType Container)) {
  Write-Host "[ERREUR] Le noyau SAFE ERP est introuvable a l'adresse : $CoreErpDir" -ForegroundColor Red
  exit 1
}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  SAFE Comptabilite Generale et Fiscalite Tunisienne" -ForegroundColor Yellow
Write-Host "  Systeme Comptable des Entreprises (SCE), Grand Livre, Balance 8 col, G50" -ForegroundColor Gray
Write-Host "  Conformite : SCE et Liasse Fiscale G50" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -LiteralPath $CoreErpDir
$LauncherScript = Join-Path $CoreErpDir "LANCER_SAFE_ERP_LOCAL.ps1"

if (-not (Test-Path -LiteralPath $LauncherScript -PathType Leaf)) {
  Write-Host "[ERREUR] Script de demarrage introuvable : $LauncherScript" -ForegroundColor Red
  exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LauncherScript -Port $Port -App "comptabilite"

