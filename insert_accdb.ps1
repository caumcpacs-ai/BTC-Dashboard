param(
    [string]$csvPath,
    [string]$baseDir,
    [string]$importDbPath
)

# Ensure UTF8 output for Korean characters
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Starting intelligent year-based import process..."
if ($csvPath) { Write-Host "Source TSV: $csvPath" }
if ($importDbPath) { Write-Host "Source DB: $importDbPath" }
Write-Host "Base Directory: $baseDir"

$source = @"
using System;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Collections.Generic;
using System.Text;
using System.Linq;

public class AccDbImporter {
    public static void Import(string csvPath, string baseDir, string importDbPath) {
        List<string> headers = new List<string>();
        List<List<string>> allRows = new List<List<string>>();

        // --- 1. LOAD SOURCE DATA ---
        if (!string.IsNullOrEmpty(csvPath)) {
            string[] lines = File.ReadAllLines(csvPath, System.Text.Encoding.UTF8);
            if (lines.Length == 0) return;
            
            string[] hArr = lines[0].Split('\t');
            foreach(string h in hArr) headers.Add(h.Trim('"').Replace(".", "_").Replace("[", "").Replace("]", ""));
            
            for (int i = 1; i < lines.Length; i++) {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;
                string[] vals = lines[i].Split('\t');
                if (vals.Length != headers.Count) continue;
                List<string> row = new List<string>();
                foreach(string v in vals) row.Add(v.Trim('"'));
                allRows.Add(row);
            }
        } 
        else if (!string.IsNullOrEmpty(importDbPath)) {
            string srcConnStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + importDbPath + ";";
            using (OleDbConnection srcConn = new OleDbConnection(srcConnStr)) {
                srcConn.Open();
                using (OleDbCommand cmd = new OleDbCommand("SELECT * FROM [GR_Data]", srcConn)) {
                    using (OleDbDataReader reader = cmd.ExecuteReader()) {
                        for (int i = 0; i < reader.FieldCount; i++) headers.Add(reader.GetName(i));
                        while (reader.Read()) {
                            List<string> row = new List<string>();
                            for (int i = 0; i < reader.FieldCount; i++) row.Add(reader.GetValue(i).ToString());
                            allRows.Add(row);
                        }
                    }
                }
            }
        }

        if (allRows.Count == 0) {
            Console.WriteLine("No source data found.");
            return;
        }

        // --- 2. IDENTIFY YEAR COLUMN ---
        int yearColIdx = -1;
        string[] yearSynonyms = new[] { "Year", "연도", "년", "YearNum", "학년도" };
        for (int i = 0; i < headers.Count; i++) {
            if (yearSynonyms.Any(s => headers[i].Equals(s, StringComparison.OrdinalIgnoreCase))) {
                yearColIdx = i;
                break;
            }
        }

        if (yearColIdx == -1) {
            Console.WriteLine("Warning: Year column not found. Defaulting to 'database.accdb'.");
        }

        // --- 3. GROUP DATA BY TARGET FILE ---
        var groups = new Dictionary<string, List<List<string>>>();
        foreach (var row in allRows) {
            string targetFile = "database.accdb";
            if (yearColIdx != -1) {
                string yearStr = row[yearColIdx];
                int year;
                if (int.TryParse(yearStr, out year) && year >= 2000) {
                    // Logic: 2023-2024, 2025-2026, etc.
                    int startYear = year - ((year - 2023) % 2);
                    if (year < 2023) startYear = year; // Fallback for very old data
                    targetFile = "database_" + startYear + "_" + (startYear + 1) + ".accdb";
                }
            }
            if (!groups.ContainsKey(targetFile)) groups[targetFile] = new List<List<string>>();
            groups[targetFile].Add(row);
        }

        // --- 4. PROCESS EACH GROUP ---
        foreach (var group in groups) {
            string targetPath = Path.Combine(baseDir, group.Key);
            ProcessGroup(targetPath, headers, group.Value);
        }
    }

    private static void ProcessGroup(string dbPath, List<string> headers, List<List<string>> rowsToInsert) {
        Console.WriteLine("Processing target: " + Path.GetFileName(dbPath) + " (" + rowsToInsert.Count + " rows)");
        
        string connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + dbPath + ";";
        if (!File.Exists(dbPath)) {
            Type catType = Type.GetTypeFromProgID("ADOX.Catalog");
            object cat = Activator.CreateInstance(catType);
            catType.InvokeMember("Create", System.Reflection.BindingFlags.InvokeMethod, null, cat, new object[] { connStr });
        }

        using (OleDbConnection conn = new OleDbConnection(connStr)) {
            conn.Open();
            
            // Ensure table exists
            bool tableExists = false;
            using (var tables = conn.GetSchema("Tables")) {
                foreach (DataRow row in tables.Rows) {
                    if (row["TABLE_NAME"].ToString() == "GR_Data") { tableExists = true; break; }
                }
            }
            
            if (!tableExists) {
                List<string> cols = new List<string>();
                foreach(string h in headers) cols.Add("[" + h + "] LONGTEXT");
                string createSql = "CREATE TABLE [GR_Data] (" + string.Join(", ", cols) + ")";
                using (OleDbCommand cmd = new OleDbCommand(createSql, conn)) cmd.ExecuteNonQuery();
            }

            // Load fingerprints for deduplication
            HashSet<string> existing = new HashSet<string>();
            using (OleDbCommand cmd = new OleDbCommand("SELECT * FROM [GR_Data]", conn)) {
                using (OleDbDataReader reader = cmd.ExecuteReader()) {
                    while (reader.Read()) {
                        List<string> vals = new List<string>();
                        for (int i = 0; i < reader.FieldCount; i++) vals.Add(reader.GetValue(i).ToString());
                        existing.Add(string.Join("|", vals));
                    }
                }
            }

            // Insert with transaction
            using (OleDbTransaction trans = conn.BeginTransaction()) {
                List<string> colNames = headers.Select(h => "[" + h + "]").ToList();
                List<string> placeholders = headers.Select(h => "?").ToList();
                string sql = "INSERT INTO [GR_Data] (" + string.Join(",", colNames) + ") VALUES (" + string.Join(",", placeholders) + ")";
                
                int inserted = 0, skipped = 0;
                using (OleDbCommand cmd = new OleDbCommand(sql, conn, trans)) {
                    foreach(var h in headers) cmd.Parameters.Add(new OleDbParameter(h, OleDbType.LongVarWChar));
                    foreach(var row in rowsToInsert) {
                        if (existing.Contains(string.Join("|", row))) { skipped++; continue; }
                        for (int j = 0; j < headers.Count; j++) cmd.Parameters[j].Value = string.IsNullOrEmpty(row[j]) ? DBNull.Value : (object)row[j];
                        cmd.ExecuteNonQuery();
                        inserted++;
                    }
                }
                trans.Commit();
                Console.WriteLine("  Result: " + inserted + " inserted, " + skipped + " skipped.");
            }
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Data", "System.Xml", "System.Core", "System.Xml.Linq"
    [AccDbImporter]::Import($csvPath, $baseDir, $importDbPath)
    Write-Host "Smart year-based import completed."
} catch {
    Write-Host "Error during import: $($_.Exception.Message)"
}
