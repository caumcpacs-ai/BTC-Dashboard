param(
    [string]$dbPath,
    [string]$mode = "stats",
    [string]$filtersJson = "{}",
    [string]$outFile = ""
)

$outPath = if ($outFile) { $outFile } else { "stats.json" }

# If dbPath is a directory or has wildcards, find all .accdb files
$targetFiles = @()
if (Test-Path $dbPath) {
    if ((Get-Item $dbPath).PSIsContainer) {
        $targetFiles = Get-ChildItem -Path $dbPath -Filter "database*.accdb"
    } else {
        $targetFiles = Get-Item $dbPath
    }
} else {
    # Try searching in script directory if not found
    $targetFiles = Get-ChildItem -Path "$PSScriptRoot\database*.accdb"
}

if ($targetFiles.Count -eq 0) {
    Write-Host "Error: No database files found."
    exit 1
}

$dbPaths = $targetFiles.FullName -join ";"

$source = @"
using System;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Collections.Generic;
using System.Text;
using System.Linq;

public class StatsDb {
    public static void Execute(string dbPaths, string outPath, string mode, string filtersJson) {
        string[] paths = dbPaths.Split(';');
        // We'll use the first DB to get the schema, assuming all have same schema
        string mainConnStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + paths[0] + ";";
        
        try {
            using (OleDbConnection conn = new OleDbConnection(mainConnStr)) {
                conn.Open();
                
                string colInOut = "입원외래";
                string colDept = "처방과";
                string colModality = "Modality";
                string colWeekday = "Weekday";
                string colGbn = "구분";
                string colHak = "학년도";
                string colYear = "Year";
                string colMonth = "Month";
                string colJuYa = "주야간";
                string colRoom = "촬영실";
                string colHour = "Hour";
                
                using (OleDbCommand cmdSchema = new OleDbCommand("SELECT TOP 1 * FROM [GR_Data]", conn)) {
                    using (OleDbDataReader readerSchema = cmdSchema.ExecuteReader()) {
                        var schemaTable = readerSchema.GetSchemaTable();
                        List<string> actualCols = new List<string>();
                        foreach (DataRow row in schemaTable.Rows) actualCols.Add(row["ColumnName"].ToString());

                        colHak = FindCol(actualCols, new[] { "학년도", "Hak", "AcademicYear" }, colHak);
                        colYear = FindCol(actualCols, new[] { "Year", "연도", "년", "YearNum" }, colYear);
                        colMonth = FindCol(actualCols, new[] { "Month", "월", "MonthNum" }, colMonth);
                        colWeekday = FindCol(actualCols, new[] { "Weekday", "요일" }, colWeekday);
                        colGbn = FindCol(actualCols, new[] { "구분", "Gbn", "Category" }, colGbn);
                        colJuYa = FindCol(actualCols, new[] { "주야간", "JuYa", "DayNight" }, colJuYa);
                        colRoom = FindCol(actualCols, new[] { "촬영실", "Room", "RoomName" }, colRoom);
                        colInOut = FindCol(actualCols, new[] { "입원외래", "InOut", "InOutType", "PatientType" }, colInOut);
                        colModality = FindCol(actualCols, new[] { "Modality", "장비", "ModalityName" }, colModality);
                        colDept = FindCol(actualCols, new[] { "처방과", "Dept", "Department", "DeptName" }, colDept);
                        colHour = FindCol(actualCols, new[] { "Hour", "시간", "HourNum" }, colHour);
                    }
                }

                // Build Master Table Query (UNION of all files)
                // Access SQL: SELECT * FROM [GR_Data] IN 'path'
                List<string> subQueries = new List<string>();
                foreach(var p in paths) {
                    subQueries.Add("SELECT * FROM [GR_Data] IN '" + p + "'");
                }
                string masterTable = "(" + string.Join(" UNION ALL ", subQueries.ToArray()) + ")";

                if (mode == "filters") {
                    StringBuilder sbF = new StringBuilder();
                    sbF.Append("{");
                    sbF.Append("\"Hak\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colHak + "] FROM " + masterTable + " WHERE [" + colHak + "] IS NOT NULL") + ",");
                    sbF.Append("\"Year\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colYear + "] FROM " + masterTable + " WHERE [" + colYear + "] IS NOT NULL") + ",");
                    sbF.Append("\"Month\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colMonth + "] FROM " + masterTable + " WHERE [" + colMonth + "] IS NOT NULL") + ",");
                    sbF.Append("\"Weekday\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colWeekday + "] FROM " + masterTable + " WHERE [" + colWeekday + "] IS NOT NULL") + ",");
                    sbF.Append("\"Gbn\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colGbn + "] FROM " + masterTable + " WHERE [" + colGbn + "] IS NOT NULL") + ",");
                    sbF.Append("\"JuYa\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colJuYa + "] FROM " + masterTable + " WHERE [" + colJuYa + "] IS NOT NULL") + ",");
                    sbF.Append("\"Room\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colRoom + "] FROM " + masterTable + " WHERE [" + colRoom + "] IS NOT NULL"));
                    sbF.Append("}");
                    File.WriteAllText(outPath, sbF.ToString(), new UTF8Encoding(false));
                    return;
                }

                string whereClause = "";
                if (!string.IsNullOrEmpty(filtersJson) && filtersJson.Length > 2) {
                    List<string> conditions = new List<string>();
                    string clean = filtersJson.Trim('{', '}');
                    int pos = 0;
                    while (pos < clean.Length) {
                        int keyStart = clean.IndexOf('"', pos);
                        if (keyStart < 0) break;
                        int keyEnd = clean.IndexOf('"', keyStart + 1);
                        if (keyEnd < 0) break;
                        string key = clean.Substring(keyStart + 1, keyEnd - keyStart - 1);
                        int colon = clean.IndexOf(':', keyEnd);
                        if (colon < 0) break;
                        int valStart = clean.IndexOf('"', colon);
                        if (valStart < 0) break;
                        int valEnd = clean.IndexOf('"', valStart + 1);
                        while (valEnd > 0 && clean[valEnd-1] == '\\') valEnd = clean.IndexOf('"', valEnd + 1);
                        if (valEnd < 0) break;
                        string vals = clean.Substring(valStart + 1, valEnd - valStart - 1).Replace("\\\"", "\"");
                        pos = valEnd + 1;
                        if (string.IsNullOrEmpty(vals)) continue;
                        
                        string realCol = "";
                        if (key == "Hak") realCol = colHak;
                        else if (key == "Year") realCol = colYear;
                        else if (key == "Month") realCol = colMonth;
                        else if (key == "Weekday") realCol = colWeekday;
                        else if (key == "Gbn") realCol = colGbn;
                        else if (key == "JuYa") realCol = colJuYa;
                        else if (key == "Room") realCol = colRoom;
                        
                        if (realCol != "") {
                            string[] valArr = vals.Split(new string[]{"|||"}, StringSplitOptions.RemoveEmptyEntries);
                            List<string> orConds = new List<string>();
                            foreach(string v in valArr) orConds.Add("([" + realCol + "] = '" + v.Replace("'", "''") + "')");
                            if (orConds.Count > 0) conditions.Add("(" + string.Join(" OR ", orConds.ToArray()) + ")");
                        }
                    }
                    if (conditions.Count > 0) whereClause = " WHERE " + string.Join(" AND ", conditions.ToArray());
                }

                StringBuilder sb = new StringBuilder();
                sb.Append("{");
                
                string monthlySql = "SELECT [" + colYear + "] AS YR, Val([" + colMonth + "]) AS MN, [" + colGbn + "] AS Gbn, COUNT(*) AS Cnt " +
                                    "FROM " + masterTable + whereClause + " " +
                                    "GROUP BY [" + colYear + "], Val([" + colMonth + "]), [" + colGbn + "] " +
                                    "ORDER BY [" + colYear + "], Val([" + colMonth + "])";
                
                string monthlyInOutSql = "SELECT [" + colYear + "] AS YR, Val([" + colMonth + "]) AS MN, [" + colInOut + "] AS InOutType, COUNT(*) AS Cnt " +
                                         "FROM " + masterTable + whereClause + " " + 
                                         "GROUP BY [" + colYear + "], Val([" + colMonth + "]), [" + colInOut + "] " +
                                         "ORDER BY [" + colYear + "], Val([" + colMonth + "])";

                string hourlySql = "SELECT Val([" + colHour + "]) AS HR, COUNT(*) AS Cnt FROM " + masterTable + whereClause + " GROUP BY Val([" + colHour + "]) ORDER BY Val([" + colHour + "])";
                string deptSql = "SELECT TOP 10 [" + colDept + "] AS Dept, COUNT(*) AS Cnt FROM " + masterTable + whereClause + " GROUP BY [" + colDept + "] ORDER BY COUNT(*) DESC";
                string weekdaySql = "SELECT [" + colWeekday + "] AS WD, COUNT(*) AS Cnt FROM " + masterTable + whereClause + " GROUP BY [" + colWeekday + "]";

                sb.Append("\"monthly\":" + QueryToJson(conn, monthlySql) + ",");
                sb.Append("\"monthlyInOut\":" + QueryToJson(conn, monthlyInOutSql) + ",");
                sb.Append("\"hourly\":" + QueryToJson(conn, hourlySql) + ",");
                sb.Append("\"dept\":" + QueryToJson(conn, deptSql) + ",");
                sb.Append("\"weekday\":" + QueryToJson(conn, weekdaySql));
                sb.Append("}");
                File.WriteAllText(outPath, sb.ToString(), new UTF8Encoding(false));
            }
        } catch (Exception ex) {
            File.WriteAllText(outPath, "{\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\"}", new UTF8Encoding(false));
        }
    }

    private static string FindCol(List<string> actualCols, string[] synonyms, string fallback) {
        foreach (var s in synonyms) if (actualCols.Contains(s)) return s;
        foreach (var c in actualCols) {
            foreach (var s in synonyms) if (c.Equals(s, StringComparison.OrdinalIgnoreCase)) return c;
        }
        return fallback;
    }

    private static string QueryToJson(OleDbConnection conn, string sql) {
        using (OleDbCommand cmd = new OleDbCommand(sql, conn)) {
            using (OleDbDataReader reader = cmd.ExecuteReader()) {
                List<string> rows = new List<string>();
                while (reader.Read()) {
                    List<string> cols = new List<string>();
                    for (int i = 0; i < reader.FieldCount; i++) {
                        string name = reader.GetName(i);
                        string val = reader.GetValue(i).ToString();
                        cols.Add("\"" + name + "\":\"" + val.Replace("\"", "\\\"") + "\"");
                    }
                    rows.Add("{" + string.Join(",", cols) + "}");
                }
                return "[" + string.Join(",", rows) + "]";
            }
        }
    }

    private static string QueryToArrayString(OleDbConnection conn, string sql) {
        using (OleDbCommand cmd = new OleDbCommand(sql, conn)) {
            using (OleDbDataReader reader = cmd.ExecuteReader()) {
                List<string> vals = new List<string>();
                while (reader.Read()) vals.Add("\"" + reader.GetValue(0).ToString().Replace("\"", "\\\"") + "\"");
                return "[" + string.Join(",", vals) + "]";
            }
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Data", "System.Xml", "System.Core"
    [StatsDb]::Execute($dbPaths, $outPath, $mode, $filtersJson)
    Write-Host "Stats successfully generated to $outPath from files: $dbPaths"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
