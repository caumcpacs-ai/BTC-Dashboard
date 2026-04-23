$dbPath = "$PSScriptRoot\test.accdb"
$csvDir = $PSScriptRoot

$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath")

try {
    try { $conn.Execute("DROP TABLE [DummyTable]") } catch {}
    
    $query = "SELECT * INTO [DummyTable] FROM [Text;FMT=Delimited;HDR=YES;DATABASE=$csvDir].[dummy.csv]"
    Write-Host "Executing: $query"
    $conn.Execute($query)
    Write-Host "Import successful!"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
