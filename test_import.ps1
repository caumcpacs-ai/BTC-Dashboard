$dbPath = "$PSScriptRoot\test.accdb"
$excelPath = "$PSScriptRoot\202603.xlsx"

$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath")

try {
    # Delete table if exists
    try { $conn.Execute("DROP TABLE [GR_Data]") } catch {}
    
    $query = "SELECT * INTO [GR_Data] FROM [Sheet1`$] IN '$excelPath' 'Excel 12.0 Xml;HDR=YES;IMEX=1;'"
    Write-Host "Executing: $query"
    $conn.Execute($query)
    Write-Host "Import successful!"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    $conn.Close()
}
