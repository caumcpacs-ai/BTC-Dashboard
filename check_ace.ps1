$conn = New-Object -ComObject ADODB.Connection
try {
    $conn.Provider = "Microsoft.ACE.OLEDB.12.0"
    Write-Host "ACE.OLEDB.12.0 is available"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
