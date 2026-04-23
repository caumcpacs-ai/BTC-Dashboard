const fs = require('fs');
const path = require('path');

const statsFile = path.join(__dirname, 'stats_cache.json');
const filterFile = path.join(__dirname, 'filter_cache.json');

if (fs.existsSync(statsFile)) {
    const data = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    const filters = {
        Hak: ["2023", "2024", "2025", "2026"],
        Year: [...new Set(data.monthly.map(d => d.YR))].sort(),
        Month: [...new Set(data.monthly.map(d => d.MN))].sort((a,b) => Number(a)-Number(b)),
        Weekday: ["월", "화", "수", "목", "금", "토", "일"],
        Gbn: [...new Set(data.monthly.map(d => d.Gbn))].sort(),
        JuYa: ["주간", "야간"],
        Room: ["1번방", "2번방", "3번방", "4번방"]
    };
    fs.writeFileSync(filterFile, JSON.stringify(filters), 'utf8');
    console.log('Created bootstrap filter cache from stats data.');
}
