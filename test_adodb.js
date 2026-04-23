const ADODB = require('node-adodb');
ADODB.PATH = 'C:\\Windows\\System32\\cscript.exe';
const path = require('path');

const dbPath = path.join(__dirname, 'database.accdb');
const connection = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${dbPath};`);

async function test() {
    try {
        const schema = await connection.schema(20);
        const hasTable = schema.some(t => t.TABLE_NAME === 'GR_Data');
        console.log("Table exists:", hasTable);
        
        const data = await connection.query("SELECT TOP 5 [입원외래], [처방과], [Weekday] FROM [GR_Data]");
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
