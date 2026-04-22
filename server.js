const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const port = 3000;

// Set up static files (to serve index.html, style.css, app.js)
app.use(express.static(__dirname));

// Set up upload directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const psScript = path.join(__dirname, 'insert_accdb.ps1');
    const dbPath = path.join(__dirname, 'database.accdb');

    try {
        console.log(`File uploaded: ${req.file.filename} (Ext: ${ext})`);
        
        let command = "";
        let csvPath = "";

        if (ext === '.accdb') {
            // If it's an Access file, pass it directly
            command = `chcp 65001 > nul && powershell -ExecutionPolicy Bypass -File "${psScript}" -importDbPath "${req.file.path}" -dbPath "${dbPath}"`;
        } else {
            // Read Excel file
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            // Convert to TSV
            const csvData = xlsx.utils.sheet_to_csv(sheet, { FS: "\t" });
            csvPath = req.file.path + '.csv';
            fs.writeFileSync(csvPath, csvData, 'utf8');
            
            command = `chcp 65001 > nul && powershell -ExecutionPolicy Bypass -File "${psScript}" -csvPath "${csvPath}" -dbPath "${dbPath}"`;
        }

        console.log(`Executing: ${command}`);
        
        exec(command, { maxBuffer: 1024 * 1024 * 50, encoding: 'utf8' }, (error, stdout, stderr) => {
            // Clean up temp files
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            if (csvPath) { try { fs.unlinkSync(csvPath); } catch (e) {} }

            if (error) {
                console.error(`Exec error: ${error}`);
                console.error(`Stderr: ${stderr}`);
                return res.status(500).send({ message: 'Failed to process and save data.', error: stdout + (stderr ? "\n" + stderr : "") });
            }
            
            console.log(`Powershell output: ${stdout}`);
            res.send({ message: 'File successfully processed.', details: stdout });
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Error processing file.', error: err.toString() });
    }
});

const crypto = require('crypto');

// GET distinct filter values
app.get('/api/filters', (req, res) => {
    const psScript = path.join(__dirname, 'get_stats_cs.ps1');
    const dbPath = path.join(__dirname, 'database.accdb');
    const tempFile = path.join(__dirname, `temp_${crypto.randomBytes(4).toString('hex')}.json`);
    
    const command = `powershell -ExecutionPolicy Bypass -File "${psScript}" -dbPath "${dbPath}" -mode "filters" -outFile "${tempFile}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            return res.status(500).json({ error: 'Failed to retrieve filters' });
        }
        try {
            if (fs.existsSync(tempFile)) {
                const data = fs.readFileSync(tempFile, 'utf8');
                fs.unlinkSync(tempFile);
                res.setHeader('Content-Type', 'application/json');
                return res.send(data);
            }
            res.status(404).json({ error: 'Filters JSON not found' });
        } catch (e) {
            console.error(`JSON Parse error: ${e.message}`);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            res.status(500).json({ error: 'Invalid JSON generated' });
        }
    });
});

// GET statistics
app.get('/api/stats', (req, res) => {
    const psScript = path.join(__dirname, 'get_stats_cs.ps1');
    const dbPath = path.join(__dirname, 'database.accdb');
    const filters = req.query.filters || '{}';
    const tempFile = path.join(__dirname, `temp_${crypto.randomBytes(4).toString('hex')}.json`);
    
    // Convert to safely escaped string for powershell argument
    const safeFilters = filters.replace(/"/g, '\\"');
    
    const command = `powershell -ExecutionPolicy Bypass -File "${psScript}" -dbPath "${dbPath}" -mode "stats" -filtersJson "${safeFilters}" -outFile "${tempFile}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 5, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            return res.status(500).json({ error: 'Failed to retrieve stats' });
        }
        try {
            if (fs.existsSync(tempFile)) {
                let dataStr = fs.readFileSync(tempFile, 'utf8');
                fs.unlinkSync(tempFile);
                
                // Get database file mtime
                const stats = fs.statSync(dbPath);
                const lastUpdate = stats.mtime;

                // Inject lastUpdate into JSON
                let data = JSON.parse(dataStr);
                data.lastUpdate = lastUpdate;
                
                res.json(data);
                return;
            }
            res.status(404).json({ error: 'Stats JSON not found' });
        } catch (e) {
            console.error(`JSON Parse error: ${e.message}`);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            res.status(500).json({ error: 'Invalid JSON generated' });
        }
    });
});

app.listen(port, () => {
    console.log(`Dashboard server running at http://localhost:${port}`);
});
