param(
    [string]$csvPath,
    [string]$dbPath,
    [string]$importDbPath
)

# Ensure UTF8 output for Korean characters
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Starting import process..."
if ($csvPath) { Write-Host "Source TSV: $csvPath" }
if ($importDbPath) { Write-Host "Source DB: $importDbPath" }
Write-Host "Target DB: $dbPath"

$source = @"
using System;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Collections.Generic;

public class AccDbImporter {
    public static void Import(string csvPath, string dbPath, string importDbPath) {
        string targetConnStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + dbPath + ";";
        
        if (!File.Exists(dbPath)) {
            Type catType = Type.GetTypeFromProgID("ADOX.Catalog");
            object cat = Activator.CreateInstance(catType);
            catType.InvokeMember("Create", System.Reflection.BindingFlags.InvokeMethod, null, cat, new object[] { targetConnStr });
        }
        
        using (OleDbConnection conn = new OleDbConnection(targetConnStr)) {
            conn.Open();
            
            List<string> headers = new List<string>();
            List<List<string>> rowsToInsert = new List<List<string>>();

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
                    rowsToInsert.Add(row);
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
                                rowsToInsert.Add(row);
                            }
                        }
                    }
                }
            }

            if (headers.Count == 0) {
                Console.WriteLine("No source data found.");
                return;
            }

            // --- 2. ENSURE TABLE EXISTS ---
            DataTable tables = conn.GetSchema("Tables");
            bool tableExists = false;
            foreach (DataRow row in tables.Rows) {
                if (row["TABLE_NAME"].ToString() == "GR_Data") {
                    tableExists = true;
                    break;
                }
            }
            
            if (!tableExists) {
                List<string> cols = new List<string>();
                foreach(string h in headers) cols.Add("[" + h + "] LONGTEXT");
                string createSql = "CREATE TABLE [GR_Data] (" + string.Join(", ", cols) + ")";
                using (OleDbCommand cmd = new OleDbCommand(createSql, conn)) cmd.ExecuteNonQuery();
            }

            // --- 3. LOAD EXISTING FINGERPRINTS ---
            HashSet<string> existingRecords = new HashSet<string>();
            if (tableExists) {
                using (OleDbCommand cmd = new OleDbCommand("SELECT * FROM [GR_Data]", conn)) {
                    using (OleDbDataReader reader = cmd.ExecuteReader()) {
                        while (reader.Read()) {
                            List<string> vals = new List<string>();
                            for (int i = 0; i < reader.FieldCount; i++) vals.Add(reader.GetValue(i).ToString());
                            existingRecords.Add(string.Join("|", vals));
                        }
                    }
                }
            }
            
            // --- 4. INSERT DATA WITH DEDUPLICATION ---
            using (OleDbTransaction trans = conn.BeginTransaction()) {
                List<string> paramNames = new List<string>();
                List<string> colNames = new List<string>();
                foreach(string h in headers) {
                    colNames.Add("[" + h + "]");
                    paramNames.Add("?");
                }
                string insertSql = "INSERT INTO [GR_Data] (" + string.Join(", ", colNames) + ") VALUES (" + string.Join(", ", paramNames) + ")";
                
                int insertedCount = 0;
                int duplicateCount = 0;
                using (OleDbCommand cmd = new OleDbCommand(insertSql, conn, trans)) {
                    foreach(string h in headers) cmd.Parameters.Add(new OleDbParameter(h, OleDbType.LongVarWChar));
                    
                    foreach(var row in rowsToInsert) {
                        string fingerprint = string.Join("|", row);
                        if (existingRecords.Contains(fingerprint)) {
                            duplicateCount++;
                            continue;
                        }
                        
                        for (int j = 0; j < headers.Count; j++) {
                            cmd.Parameters[j].Value = string.IsNullOrEmpty(row[j]) ? DBNull.Value : (object)row[j];
                        }
                        cmd.ExecuteNonQuery();
                        insertedCount++;
                        existingRecords.Add(fingerprint);
                    }
                }
                trans.Commit();
                Console.WriteLine("Import Result: " + insertedCount + " rows inserted, " + duplicateCount + " duplicates skipped.");
            }
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Data", "System.Xml"
    [AccDbImporter]::Import($csvPath, $dbPath, $importDbPath)
    Write-Host "Data import completed successfully."
} catch {
    Write-Host "Error during import: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Host "Inner Error: $($_.Exception.InnerException.Message)"
    }
}
