import { createProject, importCsvProject, defaultPointHeight, appendStakeout, removeFieldbookEntry, validateConfigurationNumber } from './src/model.mjs';
import { kilometresToMetres, radiansToGon } from './src/core/units.mjs';
import { fieldbookToCsv, CsvValidationError } from './src/io/csv.mjs';

const element = id => document.getElementById(id);
const DEMO = 'Name,X,Y,Z,h\nST1,1000.000,2000.000,100.000,1.600\nOR1,1000.000,2050.000,100.000,1.600\nP1,1035.000,2045.000,101.200,1.800\nP2,1072.000,2012.000,99.400,1.500\nP3,980.000,2028.000,102.300,1.800';
let project = createProject();
let latestEntry = null;
let readSequence = 0;
const fixed = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : '—';
function textCell(row, value, className = '') {
    const cell = row.insertCell(); cell.textContent = value; if (className) cell.className = className; return cell;
}
function showMessage(text, error = false) {
    const box = element('message'); box.textContent = text; box.className = error ? 'message error' : 'message';
    box.setAttribute('role', error ? 'alert' : 'status'); box.hidden = false;
}
function clearMessage() { element('message').hidden = true; }
function reportError(error, prefix = '') {
    const detail = error instanceof CsvValidationError
        ? error.issues.slice(0, 8).map(issue => `Riga ${issue.line}: ${issue.message}`).join('\n') + (error.issues.length > 8 ? `\nAltri ${error.issues.length - 8} problemi nel file.` : '')
        : error.message;
    showMessage(prefix + detail, true);
}
function renderProject() {
    element('projectName').textContent = project.name;
    element('pointCount').textContent = project.sourcePoints.length;
    element('shotCount').textContent = project.fieldbook.length;
    element('revision').textContent = `Revisione ${project.revision}`;
    element('loadedLabel').textContent = `${project.sourcePoints.length} punti · revisione ${project.revision}`;
    element('sourceBadge').textContent = project.name === 'Esempio sintetico' ? 'ESEMPIO' : 'CSV';
    element('inputState').textContent = 'Dati caricati in memoria';
    const body = element('pointsTable').tBodies[0]; body.replaceChildren();
    for (const point of project.sourcePoints) {
        const row = body.insertRow(); textCell(row, point.name);
        for (const axis of ['e', 'n', 'z']) textCell(row, fixed(point[axis]), 'number');
        textCell(row, fixed(defaultPointHeight(project, point.id, 'target')), 'number');
    }
    for (const id of ['stationPoint', 'orientPoint', 'targetPoint']) {
        const select = element(id); select.replaceChildren();
        for (const point of project.sourcePoints) select.add(new Option(point.name, point.id));
        select.disabled = !project.sourcePoints.length;
    }
    const ids = project.sourcePoints.map(point => point.id);
    if (ids.length) {
        element('stationPoint').value = ids[0];
        element('orientPoint').value = ids[1] || ids[0];
        element('targetPoint').value = ids[2] || ids[1] || ids[0];
        updateHeight('station'); updateHeight('target');
    }
    element('calculatePolar').disabled = !project.sourcePoints.length;
    renderFieldbook(); resetResult();
}
function loadCsv(text, fileName, name = fileName) {
    // Parsing and validation finish before the active project or point table changes.
    const nextProject = importCsvProject(project, text, fileName);
    const previousRows = nextProject.fieldbook.length;
    project = { ...nextProject, name };
    element('pointInput').value = text;
    for (const input of document.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    renderProject();
    showMessage(`${project.sourcePoints.length} punti importati. X = Est, Y = Nord; quote e altezze in metri.${previousRows ? '\nLe battute già calcolate conservano i dati precedenti e sono marcate nel libretto.' : ''}`);
}
function updateHeight(role) {
    if (!project.sourcePoints.length) return;
    const pointId = element(role === 'station' ? 'stationPoint' : 'targetPoint').value;
    element(role === 'station' ? 'stationHeight' : 'targetHeight').value = String(defaultPointHeight(project, pointId, role === 'station' ? 'instrument' : 'target'));
}
function resetResult() {
    latestEntry = null;
    for (const row of element('Field-book-Table').querySelectorAll('tr.selected')) row.classList.remove('selected');
    element('resultContext').textContent = 'PRONTO AL CALCOLO';
    element('resultTitle').textContent = 'Imposta la battuta';
    element('resultDescription').textContent = 'Seleziona stazione, orientamento e bersaglio.';
    for (const id of ['resultHz', 'resultZenith', 'resultDistance']) element(id).textContent = '—';
    element('resultDetails').hidden = true;
}
function renderResult(entry) {
    const result = entry.result; latestEntry = entry;
    element('resultContext').textContent = entry.sourceRevision === project.revision ? `BATTUTA CALCOLATA · REV. ${entry.sourceRevision}` : `DATI PRECEDENTI · REV. ${entry.sourceRevision}`;
    element('resultTitle').textContent = `${entry.station.name} → ${entry.target.name}`;
    element('resultDescription').textContent = `Orientamento ${entry.orientation.name} · hi ${fixed(result.instrumentHeight)} m · ht ${fixed(result.targetHeight)} m`;
    element('resultHz').textContent = fixed(radiansToGon(result.relativeAzimuth), 4);
    element('resultZenith').textContent = fixed(radiansToGon(result.zenithAngle), 4);
    element('resultDistance').textContent = fixed(result.slopeDistance);
    const details = element('resultDetails'); details.replaceChildren();
    for (const [label, value] of [
        ['Distanza orizzontale', `${fixed(result.horizontalDistance)} m`],
        ['Dislivello strumento → bersaglio', `${fixed(result.verticalDifference)} m`],
        ['Orizzontale ridotta al mare', `${fixed(result.seaLevelHorizontalDistance)} m`],
        ['Fattore di riduzione', fixed(result.seaLevelScaleFactor, 8)]
    ]) {
        const item = document.createElement('span'); item.textContent = label;
        const number = document.createElement('strong'); number.textContent = value; item.append(number); details.append(item);
    }
    details.hidden = false; renderFieldbook();
}
function renderFieldbook() {
    const body = element('Field-book-Table').tBodies[0]; body.replaceChildren();
    for (const [index, entry] of project.fieldbook.entries()) {
        const row = body.insertRow(); if (entry.id === latestEntry?.id) row.className = 'selected';
        textCell(row, index + 1, 'number'); textCell(row, entry.station.name);
        const targetCell = row.insertCell(), targetButton = document.createElement('button');
        targetButton.type = 'button'; targetButton.className = 'point-button'; targetButton.textContent = entry.target.name;
        targetButton.setAttribute('aria-label', `Mostra battuta ${index + 1}, bersaglio ${entry.target.name}`);
        targetButton.addEventListener('click', () => renderResult(entry)); targetCell.append(targetButton);
        for (const value of [fixed(radiansToGon(entry.result.relativeAzimuth), 4), fixed(radiansToGon(entry.result.zenithAngle), 4),
            fixed(entry.result.slopeDistance), fixed(entry.result.instrumentHeight), fixed(entry.result.targetHeight)]) textCell(row, value, 'number');
        const statusCell = row.insertCell(), status = document.createElement('span');
        status.className = `source-status${entry.sourceRevision === project.revision ? '' : ' stale'}`;
        status.textContent = entry.sourceRevision === project.revision ? `Rev. ${entry.sourceRevision}` : `Rev. ${entry.sourceRevision} · precedente`;
        statusCell.append(status);
        const removeCell = row.insertCell(), remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'remove-button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Rimuovi battuta ${index + 1}`);
        remove.addEventListener('click', () => {
            project = removeFieldbookEntry(project, entry.id);
            if (latestEntry?.id === entry.id) resetResult();
            renderFieldbook(); clearMessage();
        }); removeCell.append(remove);
    }
    element('bookEmpty').hidden = !!project.fieldbook.length;
    element('bookCount').textContent = project.fieldbook.length;
    element('shotCount').textContent = project.fieldbook.length;
    element('downloadFieldbookCSV').disabled = !project.fieldbook.length;
}
function readNumber(id, label, positive = false) {
    const input = element(id); input.removeAttribute('aria-invalid');
    try { return validateConfigurationNumber(input.value, label, { positive }); }
    catch (error) { input.setAttribute('aria-invalid', 'true'); throw error; }
}
function calculate() {
    try {
        const selection = { stationId: element('stationPoint').value, orientationId: element('orientPoint').value, targetId: element('targetPoint').value,
            instrumentHeight: readNumber('stationHeight', 'Altezza strumento'), targetHeight: readNumber('targetHeight', 'Altezza bersaglio'),
            earthRadius: kilometresToMetres(readNumber('earthRadius', 'Raggio terrestre', true)) };
        const added = appendStakeout(project, selection); project = added.project;
        clearMessage(); renderResult(added.entry);
    } catch (error) { reportError(error, 'Battuta non aggiunta. '); }
}
function loadExample() {
    readSequence++;
    try { loadCsv(DEMO, 'esempio.csv', 'Esempio sintetico'); }
    catch (error) { reportError(error); }
}
element('loadExample').addEventListener('click', loadExample);
element('loadPoints').addEventListener('click', () => {
    readSequence++;
    try { loadCsv(element('pointInput').value, 'Punti manuali.csv', 'Punti manuali'); }
    catch (error) { reportError(error, 'Importazione annullata: i punti caricati restano disponibili.\n'); }
});
element('pointInput').addEventListener('input', () => { readSequence++; element('inputState').textContent = 'CSV modificato · premi Importa punti'; });
element('chooseFile').addEventListener('click', () => element('fileInput').click());
element('fileInput').addEventListener('change', async event => {
    const file = event.target.files[0], sequence = ++readSequence;
    if (!file) return;
    try {
        if (file.size > 10 * 1024 * 1024) throw new RangeError('Dimensione massima CSV: 10 MB.');
        const text = await file.text(); if (sequence !== readSequence) return;
        if (file.name.toLowerCase().endsWith('.xml')) throw new RangeError('LandXML non disponibile nella fase 1. Importare un CSV Name,X,Y,Z,h.');
        loadCsv(text, file.name);
    } catch (error) { if (sequence === readSequence) reportError(error, 'Importazione annullata: i punti caricati restano disponibili.\n'); }
    finally { event.target.value = ''; }
});
element('stationPoint').addEventListener('change', () => { updateHeight('station'); resetResult(); });
element('targetPoint').addEventListener('change', () => { updateHeight('target'); resetResult(); });
element('orientPoint').addEventListener('change', resetResult);
for (const id of ['stationHeight', 'targetHeight', 'earthRadius']) element(id).addEventListener('input', () => { element(id).removeAttribute('aria-invalid'); resetResult(); });
element('calculatePolar').addEventListener('click', calculate);
element('downloadFieldbookCSV').addEventListener('click', () => {
    try {
        const url = URL.createObjectURL(new Blob([fieldbookToCsv(project.fieldbook, project.revision)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'fieldbook.csv'; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) { reportError(error); }
});
loadExample(); clearMessage();
