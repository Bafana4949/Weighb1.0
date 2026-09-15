$combos = @(
    @{ Baud = 4800; Parity = "Even"; Bits = 7; Stop = "One" },
    @{ Baud = 4800; Parity = "None"; Bits = 8; Stop = "One" },
    @{ Baud = 9600; Parity = "Even"; Bits = 7; Stop = "One" },
    @{ Baud = 2400; Parity = "Even"; Bits = 7; Stop = "One" },
    @{ Baud = 2400; Parity = "None"; Bits = 8; Stop = "One" },
    @{ Baud = 1200; Parity = "Even"; Bits = 7; Stop = "One" }
)

foreach ($c in $combos) {
    try {
        $port = New-Object System.IO.Ports.SerialPort "COM4", $c.Baud, $c.Parity, $c.Bits, $c.Stop
        $port.ReadTimeout = 1500
        $port.Open()
        Start-Sleep -Milliseconds 400
        $bytes = New-Object byte[] 128
        $read = $port.Read($bytes, 0, 128)
        $port.Close()
        if ($read -gt 0) {
            $hex = ($bytes[0..([Math]::Min(31, $read-1))] | ForEach-Object { "{0:X2}" -f $_ }) -join " "
            $chars = ($bytes[0..([Math]::Min(31, $read-1))] | ForEach-Object { if ($_ -ge 32 -and $_ -le 126) { [char]$_ } else { '.' } }) -join ""
            Write-Host "Config: $($c.Baud)-$($c.Bits)-$($c.Parity)-$($c.Stop) | Bytes: $read"
            Write-Host "  HEX:   $hex"
            Write-Host "  ASCII: $chars"
        }
    } catch {
        if ($port -and $port.IsOpen) { $port.Close() }
        Write-Host "Config: $($c.Baud)-$($c.Bits)-$($c.Parity) Failed: $_"
    }
}
