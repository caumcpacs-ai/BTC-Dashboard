param(
    [string]$dbPath,
    [string]$mode = "stats",
    [string]$filtersJson = "{}",
    [string]$outFile = ""
)

$outPath = if ($outFile) { $outFile } else { "stats.json" }

$source = @"
using System;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Collections.Generic;
using System.Text;

public class StatsDb {
    public static void Execute(string dbPath, string outPath, string mode, string filtersJson) {
        string connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + dbPath + ";";
        try {
            using (OleDbConnection conn = new OleDbConnection(connStr)) {
                conn.Open();
                
                string colInOut = "\uC785\uC6D0\uC678\uB798";
                string colDept = "\uCC98\uBC29\uACFC";
                string colModality = "Modality";
                string colWeekday = "Weekday";
                string colGbn = "\uAD6C\uBD84";
                string colHak = "\uD559\uB144\uB3C4";
                string colYear = "Year";
                string colMonth = "Month";
                string colJuYa = "\uC8FC\uC57C\uAC04";
                string colRoom = "\uCD2C\uC601\uC2E4";
                string colHour = "Hour";
                
                using (OleDbCommand cmdSchema = new OleDbCommand("SELECT TOP 1 * FROM [GR_Data]", conn)) {
                    using (OleDbDataReader readerSchema = cmdSchema.ExecuteReader()) {
                        var schemaTable = readerSchema.GetSchemaTable();
                        List<string> actualCols = new List<string>();
                        foreach (DataRow row in schemaTable.Rows) actualCols.Add(row["ColumnName"].ToString());

                        colHak = FindCol(actualCols, new[] { "\uD559\uB144\uB3C4", "Hak", "AcademicYear" }, colHak);
                        colYear = FindCol(actualCols, new[] { "Year", "\uC5F0\uB3C4", "\uB144", "YearNum" }, colYear);
                        colMonth = FindCol(actualCols, new[] { "Month", "\uC6d4", "MonthNum" }, colMonth);
                        colWeekday = FindCol(actualCols, new[] { "Weekday", "\uC694\uC77C" }, colWeekday);
                        colGbn = FindCol(actualCols, new[] { "\uAD6C\uBD84", "Gbn", "Category" }, colGbn);
                        colJuYa = FindCol(actualCols, new[] { "\uC8FC\uC57C\uAC04", "JuYa", "DayNight" }, colJuYa);
                        colRoom = FindCol(actualCols, new[] { "\uCD2C\uC601\uC2E4", "Room", "RoomName" }, colRoom);
                        colInOut = FindCol(actualCols, new[] { "\uC785\uC6D0\uC678\uB798", "InOut", "InOutType", "PatientType" }, colInOut);
                        colModality = FindCol(actualCols, new[] { "Modality", "\uC7A5\uBE44", "ModalityName" }, colModality);
                        colDept = FindCol(actualCols, new[] { "\uCC98\uBC29\uACFC", "Dept", "Department", "DeptName" }, colDept);
                        colHour = FindCol(actualCols, new[] { "Hour", "\uC2DC\uAC04", "HourNum" }, colHour);
                    }
                }

                if (mode == "filters") {
                    StringBuilder sbF = new StringBuilder();
                    sbF.Append("{");
                    sbF.Append("\"Hak\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colHak + "] FROM [GR_Data] WHERE [" + colHak + "] IS NOT NULL") + ",");
                    sbF.Append("\"Year\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colYear + "] FROM [GR_Data] WHERE [" + colYear + "] IS NOT NULL") + ",");
                    sbF.Append("\"Month\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colMonth + "] FROM [GR_Data] WHERE [" + colMonth + "] IS NOT NULL") + ",");
                    sbF.Append("\"Weekday\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colWeekday + "] FROM [GR_Data] WHERE [" + colWeekday + "] IS NOT NULL") + ",");
                    sbF.Append("\"Gbn\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colGbn + "] FROM [GR_Data] WHERE [" + colGbn + "] IS NOT NULL") + ",");
                    sbF.Append("\"JuYa\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colJuYa + "] FROM [GR_Data] WHERE [" + colJuYa + "] IS NOT NULL") + ",");
                    sbF.Append("\"Room\":" + QueryToArrayString(conn, "SELECT DISTINCT [" + colRoom + "] FROM [GR_Data] WHERE [" + colRoom + "] IS NOT NULL"));
                    sbF.Append("}");
                    File.WriteAllText(outPath, sbF.ToString(), new UTF8Encoding(false));
                    return;
                }

                string whereClause = "";
                if (filtersJson.Length > 2) {
                    List<string> conditions = new List<string>();
                    string cleanJson = filtersJson.Trim('{', '}');
                    string[] pairs = cleanJson.Split(new string[] { "\",\"" }, StringSplitOptions.None);
                    foreach(string pair in pairs) {
                        string p = pair.Trim('"');
                        int colonIdx = p.IndexOf("\":\"");
                        if (colonIdx > 0) {
                            string key = p.Substring(0, colonIdx);
                            string vals = p.Substring(colonIdx + 3).Replace("\\\"", "\"");
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
                    }
                    if (conditions.Count > 0) whereClause = " WHERE " + string.Join(" AND ", conditions.ToArray());
                }

                StringBuilder sb = new StringBuilder();
                sb.Append("{");
                
                string monthlySql = "SELECT [" + colYear + "] AS YR, Val([" + colMonth + "]) AS MN, [" + colGbn + "] AS Gbn, COUNT(*) AS Cnt " +
                                    "FROM [GR_Data]" + whereClause + " " +
                                    "GROUP BY [" + colYear + "], Val([" + colMonth + "]), [" + colGbn + "] " +
                                    "ORDER BY [" + colYear + "], Val([" + colMonth + "])";
                
                string monthlyInOutSql = "SELECT [" + colYear + "] AS YR, Val([" + colMonth + "]) AS MN, [" + colInOut + "] AS InOutType, COUNT(*) AS Cnt " +
                                         "FROM [GR_Data]" + whereClause + " " + 
                                         "GROUP BY [" + colYear + "], Val([" + colMonth + "]), [" + colInOut + "] " +
                                         "ORDER BY [" + colYear + "], Val([" + colMonth + "])";

                string hourlySql = "SELECT Val([" + colHour + "]) AS HR, COUNT(*) AS Cnt FROM [GR_Data]" + whereClause + " GROUP BY Val([" + colHour + "]) ORDER BY Val([" + colHour + "])";
                string deptSql = "SELECT TOP 10 [" + colDept + "] AS Dept, COUNT(*) AS Cnt FROM [GR_Data]" + whereClause + " GROUP BY [" + colDept + "] ORDER BY COUNT(*) DESC";
                string weekdaySql = "SELECT [" + colWeekday + "] AS WD, COUNT(*) AS Cnt FROM [GR_Data]" + whereClause + " GROUP BY [" + colWeekday + "]";

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
    Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Data", "System.Xml"
    [StatsDb]::Execute($dbPath, $outPath, $mode, $filtersJson)
    Write-Host "Stats successfully generated to $outPath"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.InnerException) { Write-Host "Inner Error: $($_.Exception.InnerException.Message)" }
}
