$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=database.accdb")
$rs = $conn.Execute("SELECT TOP 1 * FROM [GR_Data]")
$cols = @()
foreach($f in $rs.Fields) { $cols += $f.Name }
$conn.Close()
$cols | ConvertTo-Json | Out-File "cols.json" -Encoding UTF8
