#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Lets the weighbridge web app open every serial (COM) port without the browser's port picker.

.DESCRIPTION
  Web Serial only exposes ports a user has approved in the browser's picker. On a dedicated weighbridge
  PC that means someone has to click "Auto-Detect Scale" at least once per browser profile.

  This script sets the Chrome and Edge enterprise policy SerialAllowAllPortsForUrls for the given
  origins. With it, navigator.serial.getPorts() returns every COM port on the machine, so the operator
  dashboard can scan all ports, find the scale indicator and connect with no buttons and no prompts,
  including after every page refresh and cable replug.

  Must run as Administrator: Windows only lets administrators write browser policy keys.

  Restart the browser afterwards and confirm at chrome://policy or edge://policy.

.PARAMETER Origins
  Exact origins (scheme://host:port) of the weighbridge app. Default: http://localhost:3010

.PARAMETER Remove
  Removes the policy again.

.EXAMPLE
  .\scripts\enable-scale-serial-policy.ps1
.EXAMPLE
  .\scripts\enable-scale-serial-policy.ps1 -Origins "http://localhost:3010","https://weighbridge.example.co.za"
#>
param(
  [string[]]$Origins = @("http://localhost:3010"),
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$policyKeys = @(
  "HKLM:\SOFTWARE\Policies\Google\Chrome\SerialAllowAllPortsForUrls",
  "HKLM:\SOFTWARE\Policies\Microsoft\Edge\SerialAllowAllPortsForUrls"
)

foreach ($key in $policyKeys) {
  if ($Remove) {
    if (Test-Path $key) {
      Remove-Item -Path $key -Recurse -Force
      Write-Host "Removed $key"
    }
    continue
  }

  if (-not (Test-Path $key)) {
    New-Item -Path $key -Force | Out-Null
  }

  # List policies are numbered string values "1", "2", ...; replace any previous list
  Get-Item -Path $key | Select-Object -ExpandProperty Property | ForEach-Object {
    Remove-ItemProperty -Path $key -Name $_
  }

  $i = 1
  foreach ($origin in $Origins) {
    New-ItemProperty -Path $key -Name "$i" -Value $origin -PropertyType String | Out-Null
    $i++
  }
  Write-Host "Set $key -> $($Origins -join ', ')"
}

if (-not $Remove) {
  Write-Host ""
  Write-Host "Done. Fully close and reopen Chrome/Edge, then check chrome://policy (or edge://policy)"
  Write-Host "for SerialAllowAllPortsForUrls. The operator dashboard will then find and connect the scale itself."
}
