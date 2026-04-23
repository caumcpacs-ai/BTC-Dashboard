$source = @"
using System;
using System.Data.OleDb;

public class Test {
    public static void Run() {
        string connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=database.accdb;";
        using (OleDbConnection conn = new OleDbConnection(connStr)) {
            conn.Open();
            string colGbn = "";
            using (OleDbCommand cmdSchema = new OleDbCommand("SELECT TOP 1 * FROM [GR_Data]", conn)) {
                using (OleDbDataReader readerSchema = cmdSchema.ExecuteReader()) {
                    colGbn = readerSchema.GetName(33);
                }
            }
            using (OleDbCommand cmd = new OleDbCommand("SELECT DISTINCT [" + colGbn + "] FROM [GR_Data]", conn)) {
                using (OleDbDataReader reader = cmd.ExecuteReader()) {
                    while(reader.Read()) {
                        Console.WriteLine(reader[0].ToString());
                    }
                }
            }
        }
    }
}
"@
Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Data"
[Test]::Run()
