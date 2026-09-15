$port = New-Object System.IO.Ports.SerialPort "COM4", 9600, "None", 8, "One"
$port.ReadTimeout = 2000
try {
    $port.Open()
    Start-Sleep -Milliseconds 500
    $bytes = New-Object byte[] 256
    $read = $port.Read($bytes, 0, 256)
    Write-Host "Read $read bytes:"
    $hex = ($bytes[0..($read-1)] | ForEach-Object { "{0:X2}" -f $_ }) -join " "
    Write-Host "HEX: $hex"
    $chars = ($bytes[0..($read-1)] | ForEach-Object { if ($_ -ge 32 -and $_ -le 126) { [char]$_ } else { '.' } }) -join ""
    Write-Host "ASCII: $chars"
} catch {
    Write-Host "Error: $_"
} finally {
    if ($port.IsOpen) { $port.Close() }
}
