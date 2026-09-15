$port = New-Object System.IO.Ports.SerialPort "COM4", 9600, "None", 8, "One"
$port.ReadTimeout = 3000
try {
    $port.Open()
    Write-Host "COM4 opened successfully!"
    $buffer = ""
    $start = [DateTime]::Now
    while (([DateTime]::Now - $start).TotalSeconds -lt 3) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $buffer += $chunk
        }
        Start-Sleep -Milliseconds 100
    }
    Write-Host "Raw data from Mettler Toledo: [$buffer]"
} catch {
    Write-Host "Error accessing COM4: $_"
} finally {
    if ($port.IsOpen) { $port.Close() }
}
