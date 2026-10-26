import { requireFinite, radiansToGon } from '../core/units.mjs';

export class CsvValidationError extends Error {
    constructor(issues) {
        super(issues.map(issue => `Riga ${issue.line}: ${issue.message}`).join('\n'));
        this.name = 'CsvValidationError';
        this.issues = issues;
    }
}
/** Small RFC-style reader: comma delimiter, escaped quotes, CRLF and quoted newlines. */
function readCsvRecords(text) {
    const rows = [];
    let fields = [], field = '', state = 'start', line = 1, startLine = 1;
    function endField() { fields.push(field); field = ''; state = 'start'; }
    function endRow() { endField(); if (fields.length > 1 || fields.some(value => value.trim() !== '')) rows.push({ fields, line: startLine }); fields = []; }
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const newline = char === '\n' || char === '\r';
        if (state === 'quoted') {
            if (char === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else state = 'afterQuote';
            } else if (newline) {
                field += '\n'; if (char === '\r' && text[i + 1] === '\n') i++; line++;
            } else field += char;
            continue;
        }
        if (char === ',') { endField(); continue; }
        if (newline) { endRow(); if (char === '\r' && text[i + 1] === '\n') i++; line++; startLine = line; continue; }
        if (state === 'afterQuote') {
            if (!/\s/.test(char)) throw new CsvValidationError([{ line, message: 'Caratteri dopo la chiusura di un campo tra virgolette.' }]);
            continue;
        }
        if (char === '"') {
            if (state === 'start' || field.trim() === '') { field = ''; state = 'quoted'; }
            else throw new CsvValidationError([{ line, message: 'Virgolette non valide nel campo CSV.' }]);
        } else { field += char; if (!/\s/.test(char)) state = 'unquoted'; }
    }
    if (state === 'quoted') throw new CsvValidationError([{ line: startLine, message: 'Campo tra virgolette non chiuso.' }]);
    endRow();
    return rows;
}
function csvHeader(fields) {
    const names = fields.map(value => value.trim().toLowerCase());
    return ['name', 'pointname', 'nome', 'punto'].includes(names[0]) && names[1] === 'x' && names[2] === 'y' && names[3] === 'z' && (names.length === 4 || names.length === 5);
}
function csvNumber(value, label, line, issues, optional = false) {
    if (value === undefined || value.trim() === '') {
        if (optional) return 0;
        issues.push({ line, message: `${label} mancante.` }); return NaN;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
        issues.push({ line, message: `${label} non numerico: usare il punto decimale.` }); return NaN;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) issues.push({ line, message: `${label} deve essere un numero finito.` });
    return number;
}
/** Pure, all-or-nothing parser. Legacy CSV maps X to East, Y to North. */
export function parsePointsCsv(text) {
    if (typeof text !== 'string') throw new TypeError('Il CSV deve essere testo.');
    if (text.length > 10 * 1024 * 1024) throw new CsvValidationError([{ line: 1, message: 'Dimensione massima CSV: 10 MB.' }]);
    const clean = text.replace(/^\uFEFF/, '');
    if (/^\s*(?:<\?xml|<(?:\w+:)?LandXML\b)/i.test(clean)) {
        throw new CsvValidationError([{ line: 1, message: 'LandXML non disponibile nella fase 1. Importare un CSV Name,X,Y,Z,h.' }]);
    }
    const records = readCsvRecords(clean), issues = [], points = [], defaults = {}, names = new Set();
    if (records.length && csvHeader(records[0].fields)) records.shift();
    if (!records.length) throw new CsvValidationError([{ line: 1, message: 'Nessun punto presente nel CSV.' }]);
    for (const record of records) {
        const fields = record.fields.map(value => value.trim()), line = record.line;
        if (fields.length !== 4 && fields.length !== 5) {
            issues.push({ line, message: `Attesi 4 o 5 campi Name,X,Y,Z,h; trovati ${fields.length}.` }); continue;
        }
        const [name, x, y, z, height] = fields;
        if (!name) issues.push({ line, message: 'Nome punto mancante.' });
        else if (names.has(name)) issues.push({ line, message: `Nome punto duplicato: ${name}.` });
        names.add(name);
        const point = { id: `point-${points.length + 1}`, name,
            e: csvNumber(x, 'X / Est', line, issues), n: csvNumber(y, 'Y / Nord', line, issues), z: csvNumber(z, 'Z / Quota', line, issues) };
        const h = csvNumber(height, 'h predefinita', line, issues, true);
        if (h < 0) issues.push({ line, message: 'h predefinita non può essere negativa.' });
        points.push(point);
        defaults[point.id] = { instrumentHeight: h, targetHeight: h };
    }
    if (issues.length) throw new CsvValidationError(issues);
    return { points, pointDefaults: defaults, source: { format: 'csv', axisOrder: 'XYZ=ENZ', text: clean } };
}
function encodeCsvCell(value, protectFormula = false) {
    let text = String(value ?? '');
    if (protectFormula && /^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
/** Export full-precision numbers from model records, never from rendered table cells. */
export function fieldbookToCsv(records, currentRevision) {
    const rows = [['Station', 'Point', 'Azimuth', 'Zenith', 'Distance', 'Target Height', 'Instrument Height', 'Orientation', 'Source Revision', 'Status']];
    for (const entry of records) {
        const result = entry.result;
        const row = [entry.station.name, entry.target.name,
            radiansToGon(result.relativeAzimuth), radiansToGon(result.zenithAngle), result.slopeDistance,
            result.targetHeight, result.instrumentHeight, entry.orientation.name,
            entry.sourceRevision, entry.sourceRevision === currentRevision ? 'current' : 'previous-source'];
        for (const i of [2, 3, 4, 5, 6, 8]) requireFinite(row[i], 'Valore del libretto');
        rows.push(row);
    }
    return '\uFEFF' + rows.map(row => row.map((value, index) => encodeCsvCell(value, [0, 1, 7].includes(index))).join(',')).join('\r\n');
}
