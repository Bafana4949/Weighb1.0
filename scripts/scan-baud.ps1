$bauds = @(4800, 9600, 2400, 1200, 19200)
$parities = @("None", "Even")
$dataBitsList = @(8, 7)

foreach ($b in $bauds) {
    foreach ($p in $parities) {
        foreach ($d in $dataBitsList) {
            if ($p -eq "None" -and $d -eq 7) { continue }
            try {
                $port = New-Object System.IO.Ports.SerialPort "COM4", $b, $p, $d, "One"
                $port.ReadTimeout = 1500
                $port.Open()
                Start-Sleep -Milliseconds 600
                $raw = $port.ReadExisting()
                $port.Close()
                if ($raw -and $raw.Trim().Length -gt 0) {
                    Write-Host "Baud: $b | Parity: $p | DataBits: $d => Sample: [$($raw.Substring(0, [Math]::Min(50, $raw.Length)))]"
                }
            } catch {
                if ($port -and $port.IsOpen) { $port.Close() }
            }
        }
    }
}
