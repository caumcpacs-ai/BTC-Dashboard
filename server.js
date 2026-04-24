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

// Simple cache for stats and filters
let statsCache = null;
let filterCache = null;
const CACHE_FILE = path.join(__dirname, 'stats_cache.json');
const FILTER_CACHE_FILE = path.join(__dirname, 'filter_cache.json');

// Load cache from disk if exists
if (fs.existsSync(CACHE_FILE)) {
    try {
        statsCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        console.log('Stats cache loaded from disk.');
    } catch (e) {
        console.error('Failed to load stats cache:', e);
    }
}
if (fs.existsSync(FILTER_CACHE_FILE)) {
    try {
        filterCache = JSON.parse(fs.readFileSync(FILTER_CACHE_FILE, 'utf8'));
        console.log('Filter cache loaded from disk.');
    } catch (e) {
        console.error('Failed to load filter cache:', e);
    }
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
            command = `chcp 65001 > nul && powershell -ExecutionPolicy Bypass -File "${psScript}" -importDbPath "${req.file.path}" -baseDir "${__dirname}"`;
        } else {
            // Read Excel file
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            // Convert to TSV
            const csvData = xlsx.utils.sheet_to_csv(sheet, { FS: "\t" });
            csvPath = req.file.path + '.csv';
            fs.writeFileSync(csvPath, csvData, 'utf8');
            
            command = `chcp 65001 > nul && powershell -ExecutionPolicy Bypass -File "${psScript}" -csvPath "${csvPath}" -baseDir "${__dirname}"`;
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

            // After successful upload, refresh the cache
            console.log('Refreshing stats cache after upload...');
            refreshStatsCache();
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Error processing file.', error: err.toString() });
    }
});

const crypto = require('crypto');

// GET distinct filter values
app.get('/api/filters', (req, res) => {
    // Return cache immediately if available
    if (filterCache) {
        console.log('Serving filters from cache');
        res.json(filterCache);
        
        // Optionally refresh in background if cache is old? 
        // For now, we refresh only on upload or when cache is missing.
        return;
    }

    const psScript = path.join(__dirname, 'get_stats_cs.ps1');
    const dbDir = __dirname;
    const tempFile = path.join(__dirname, `temp_${crypto.randomBytes(4).toString('hex')}.json`);
    
    // Find all database files
    const dbFiles = fs.readdirSync(dbDir).filter(f => f.startsWith('database') && f.endsWith('.accdb'));
    if (dbFiles.length === 0) return res.status(404).json({ error: 'No database files found' });

    const dbPath = path.join(__dirname, dbFiles[0]);
    console.log('Generating filters (no cache)...');
    const command = `powershell -ExecutionPolicy Bypass -File "${psScript}" -dbPath "${dbPath}" -mode "filters" -outFile "${tempFile}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            return res.status(500).json({ error: 'Failed to retrieve filters' });
        }
        try {
            if (fs.existsSync(tempFile)) {
                const dataStr = fs.readFileSync(tempFile, 'utf8');
                fs.unlinkSync(tempFile);
                const data = JSON.parse(dataStr);
                
                // Save to cache
                filterCache = data;
                fs.writeFileSync(FILTER_CACHE_FILE, JSON.stringify(data), 'utf8');
                
                res.setHeader('Content-Type', 'application/json');
                return res.send(dataStr);
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
    const dbDir = __dirname;
    const filters = req.query.filters || '{}';
    const refresh = req.query.refresh === 'true';
    const isDefault = filters === '{}' || filters === '""';

    // If default request and we have cache, return it immediately (unless refresh is requested)
    if (isDefault && statsCache && !refresh) {
        console.log('Serving stats from cache');
        return res.json(statsCache);
    }

    // Find all database files
    const dbFiles = fs.readdirSync(dbDir).filter(f => f.startsWith('database') && f.endsWith('.accdb'));
    if (dbFiles.length === 0) return res.status(404).json({ error: 'No database files found' });
    
    const dbPath = path.join(__dirname, dbFiles[0]);
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
                
                // Save to cache if default
                if (isDefault) {
                    statsCache = data;
                    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf8');
                }

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

function refreshStatsCache() {
    const psScript = path.join(__dirname, 'get_stats_cs.ps1');
    const dbDir = __dirname;
    const tempFile = path.join(__dirname, `temp_cache_refresh.json`);
    
    // Check if any database file exists
    const dbFiles = fs.readdirSync(dbDir).filter(f => f.startsWith('database') && f.endsWith('.accdb'));
    if (dbFiles.length === 0) {
        console.log('No database*.accdb files found, skipping cache refresh.');
        return;
    }

    // We pass the directory or the first file, the script will find all
    const dbPath = path.join(__dirname, dbFiles[0]);
    const command = `powershell -ExecutionPolicy Bypass -File "${psScript}" -dbPath "${dbPath}" -mode "stats" -filtersJson "{}" -outFile "${tempFile}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Cache refresh error: ${error}`);
            return;
        }
        try {
            if (fs.existsSync(tempFile)) {
                let dataStr = fs.readFileSync(tempFile, 'utf8');
                fs.unlinkSync(tempFile);
                
                const stats = fs.statSync(dbPath);
                let data = JSON.parse(dataStr);
                data.lastUpdate = stats.mtime;
                
                statsCache = data;
                fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf8');
                console.log('Stats cache successfully refreshed.');
            }
        } catch (e) {
            console.error(`Cache refresh JSON error: ${e.message}`);
        }
    });

    // Also refresh filters
    refreshFilterCache();
}

function refreshFilterCache() {
    const psScript = path.join(__dirname, 'get_stats_cs.ps1');
    const dbDir = __dirname;
    const tempFile = path.join(__dirname, `temp_filter_refresh.json`);
    
    // Find all database files
    const dbFiles = fs.readdirSync(dbDir).filter(f => f.startsWith('database') && f.endsWith('.accdb'));
    if (dbFiles.length === 0) return;
    
    const dbPath = path.join(__dirname, dbFiles[0]);

    console.log('Refreshing filter cache in background...');
    const command = `powershell -ExecutionPolicy Bypass -File "${psScript}" -dbPath "${dbPath}" -mode "filters" -outFile "${tempFile}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Filter refresh error: ${error}`);
            return;
        }
        try {
            if (fs.existsSync(tempFile)) {
                let dataStr = fs.readFileSync(tempFile, 'utf8');
                fs.unlinkSync(tempFile);
                filterCache = JSON.parse(dataStr);
                fs.writeFileSync(FILTER_CACHE_FILE, JSON.stringify(filterCache), 'utf8');
                console.log('Filter cache successfully refreshed.');
            }
        } catch (e) {
            console.error(`Filter refresh JSON error: ${e.message}`);
        }
    });
}

app.listen(port, () => {
    console.log(`Dashboard server running at http://localhost:${port}`);
    // Initial cache refresh on start if no cache exists or just to be sure
    refreshStatsCache();
});
