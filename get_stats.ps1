param(
    [string]$dbPath
)

if (-not (Test-Path $dbPath)) {
    Write-Output "{""error"": ""Database not found""}"
    exit
}

$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$dbPath;"
$conn = New-Object -ComObject ADODB.Connection

try {
    $conn.Open($connStr)

    $result = @{
        hourly = @()
        inOut = @()
        department = @()
        modality = @()
        weekday = @()
    }

    function Query-To-Array($sql) {
        $rs = New-Object -ComObject ADODB.Recordset
        try {
            $rs.Open($sql, $conn, 3, 3)
            $list = @()
            while (-not $rs.EOF) {
                $row = @{}
                foreach ($f in $rs.Fields) {
                    $row[$f.Name] = $f.Value
                }
                $list += $row
                $rs.MoveNext()
            }
            $rs.Close()
            return $list
        } catch {
            Write-Error "Error in query: $sql. Exception: $($_.Exception.Message)"
            return @()
        }
    }

    # Fetch column names dynamically to avoid script encoding issues
    $rsSchema = New-Object -ComObject ADODB.Recordset
    $rsSchema.Open("SELECT TOP 1 * FROM [GR_Data]", $conn, 3, 3)
    $cols = @()
    foreach ($f in $rsSchema.Fields) { $cols += $f.Name }
    $rsSchema.Close()

    # Find exact column names by matching
    $colInOut = ""
    $colDept = ""
    $colModality = ""
    $colWeekday = ""
    
    foreach ($c in $cols) {
        # Using simple pattern matching
        if ($c -match "입원" -or $c -match "외래") { $colInOut = $c }
        if ($c -match "처방과") { $colDept = $c }
        if ($c -match "Modality") { $colModality = $c }
        if ($c -match "Weekday") { $colWeekday = $c }
    }
    
    # If pattern match fails due to encoding, fallback to known indices
    if ($colInOut -eq "") { $colInOut = $cols[32] }
    if ($colDept -eq "") { $colDept = $cols[11] }
    if ($colModality -eq "") { $colModality = $cols[34] }
    if ($colWeekday -eq "") { $colWeekday = $cols[23] }

    # 1. Hourly Trend
    $result.hourly = Query-To-Array "SELECT Val([Hour]) AS [Hour], COUNT(*) AS Cnt FROM [GR_Data] GROUP BY Val([Hour]) ORDER BY Val([Hour])"

    # 2. Inpatient vs Outpatient
    $result.inOut = Query-To-Array "SELECT [$colInOut] AS InOutType, COUNT(*) AS Cnt FROM [GR_Data] GROUP BY [$colInOut]"

    # 3. Department (Top 6)
    $result.department = Query-To-Array "SELECT TOP 6 [$colDept] AS Dept, COUNT(*) AS Cnt FROM [GR_Data] GROUP BY [$colDept] ORDER BY COUNT(*) DESC"

    # 4. Modality
    $result.modality = Query-To-Array "SELECT TOP 10 [$colModality] AS Modality, COUNT(*) AS Cnt FROM [GR_Data] GROUP BY [$colModality] ORDER BY COUNT(*) DESC"

    # 5. Weekday
    $result.weekday = Query-To-Array "SELECT [$colWeekday] AS Weekday, COUNT(*) AS Cnt FROM [GR_Data] GROUP BY [$colWeekday]"

    $conn.Close()

    $json = $result | ConvertTo-Json -Depth 10 -Compress
    $json | Out-File -FilePath "$PSScriptRoot\stats.json" -Encoding UTF8
    Write-Output $json


} catch {
    Write-Output "{""error"": ""$($_.Exception.Message)""}"
}
