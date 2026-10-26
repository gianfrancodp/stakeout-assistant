import { createProject, importSurveyProject, defaultPointHeight, appendStakeout, removeFieldbookEntry, validateConfigurationNumber } from './src/model.mjs';
import { kilometresToMetres, radiansToGon } from './src/core/units.mjs';
import { fieldbookToCsv, CsvValidationError } from './src/io/csv.mjs';

// Keep the existing page, labels, controls and stylesheet; adapt the new model to its DOM.
const element = id => document.getElementById(id);
const fixed = (value, digits = 3) => value.toFixed(digits);
let project = createProject();
let readSequence = 0;

function textCell(row, value) {
    const cell = row.insertCell();
    cell.textContent = value;
    return cell;
}
function showFileWarning(message) {
    const warning = element('fileWarning');
    warning.textContent = message;
    warning.style.whiteSpace = 'pre-line';
    warning.classList.remove('hidden');
}
function clearFileWarning() {
    const warning = element('fileWarning');
    warning.textContent = '';
    warning.classList.add('hidden');
}
function reportError(error, prefix = '') {
    const detail = error instanceof CsvValidationError
        ? error.issues.slice(0, 8).map(issue => `Row ${issue.line}: ${issue.message}`).join('\n')
            + (error.issues.length > 8 ? `\n${error.issues.length - 8} additional issues.` : '')
        : error.message;
    showFileWarning(prefix + detail);
}
function renderPoints() {
    const body = element('pointsTable').tBodies[0];
    body.replaceChildren();
    for (const point of project.sourcePoints) {
        const row = body.insertRow();
        textCell(row, point.name);
        for (const axis of ['e', 'n', 'z']) textCell(row, fixed(point[axis]));
        const role = project.setups.some(setup => setup.kind === 'survey' && setup.pointId === point.id) ? 'instrument' : 'target';
        const key = role === 'instrument' ? 'instrumentHeight' : 'targetHeight';
        const cell = textCell(row, project.pointDefaults[point.id]?.[key + 'Ambiguous'] ? 'varies' : fixed(defaultPointHeight(project, point.id, role)));
        cell.title = `${role} height default; raw observation heights are preserved separately.`;
    }
    const ids = project.sourcePoints.map(point => point.id);
    for (const id of ['stationPoint', 'orientPoint', 'targetPoint']) {
        const select = element(id);
        select.replaceChildren();
        for (const point of project.sourcePoints) select.add(new Option(point.name, point.id));
    }
    if (ids.length) {
        element('stationPoint').value = ids[0];
        element('orientPoint').value = ids[1] || ids[0];
        element('targetPoint').value = ids[2] || ids[1] || ids[0];
    }
}
function renderFieldbook() {
    const body = element('Field-book-Table').tBodies[0];
    body.replaceChildren();
    for (const [index, entry] of project.fieldbook.entries()) {
        const row = body.insertRow();
        const stale = entry.sourceRevision !== project.revision;
        row.dataset.sourceRevision = String(entry.sourceRevision);
        row.title = `Source revision ${entry.sourceRevision}${stale ? ' — previous source; original coordinates and heights retained' : ''}`;
        const removeCell = row.insertCell();
        const remove = document.createElement('button');
        remove.textContent = '-';
        remove.setAttribute('aria-label', `Remove fieldbook row ${index + 1}`);
        remove.addEventListener('click', () => {
            project = removeFieldbookEntry(project, entry.id);
            renderFieldbook();
        });
        removeCell.append(remove);
        textCell(row, entry.station.name);
        const targetCell = textCell(row, entry.target.name + (stale ? ' *' : ''));
        targetCell.title = row.title;
        textCell(row, fixed(radiansToGon(entry.result.relativeAzimuth), 4));
        textCell(row, fixed(radiansToGon(entry.result.zenithAngle), 4));
        textCell(row, fixed(entry.result.slopeDistance));
        textCell(row, fixed(entry.result.targetHeight));
    }
}
function loadInput(text, fileName) {
    // Nothing in the active project or DOM changes until the entire input is valid.
    const next = importSurveyProject(project, text, fileName);
    project = next;
    element('pointInput').value = text;
    renderPoints();
    renderFieldbook();
    element('polarResult').replaceChildren();
    const notices = [];
    if (project.importSummary) {
        const summary = project.importSummary;
        notices.push(`LandXML 1.1: ${summary.documents} documents, ${summary.points} exported points, ${summary.setups} setups, ${summary.observations} raw observations (${summary.directionOnly} direction-only).`);
        notices.push(...new Set(project.diagnostics.map(item => item.message)));
    }
    if (project.fieldbook.length) notices.push('Rows marked * retain coordinates and heights from a previous source revision.');
    if (notices.length) showFileWarning(notices.join('\n')); else clearFileWarning();
}
function appendLine(parent, text = '', strong = false) {
    const node = document.createElement(strong ? 'strong' : 'span');
    node.textContent = text;
    parent.append(node, document.createElement('br'));
}
function renderResult(entry) {
    const result = entry.result;
    const container = element('polarResult');
    container.replaceChildren();
    appendLine(container, 'Results:', true);
    appendLine(container);
    appendLine(container, `Station: ${entry.station.name}`);
    appendLine(container, `Orient: ${entry.orientation.name}`);
    appendLine(container, `Target: ${entry.target.name}`);
    appendLine(container);
    appendLine(container, 'Distances:', true);
    appendLine(container, `Measured Horizontal Distance: ${fixed(result.horizontalDistance)} meters`);
    appendLine(container, `Sea Level Horizontal Distance: ${fixed(result.seaLevelHorizontalDistance)} meters`);
    appendLine(container, `Total Spatial Distance: ${fixed(result.slopeDistance)} meters`);
    appendLine(container, `Scale Factor: ${fixed(result.seaLevelScaleFactor, 6)}`);
    appendLine(container);
    appendLine(container, 'Angles:', true);
    appendLine(container, `Orientation Azimuth with North: ${fixed(radiansToGon(result.orientationAzimuth), 4)}ᵍ`);
    appendLine(container, `Target Azimuth with North: ${fixed(radiansToGon(result.targetAzimuth), 4)}ᵍ`);
    appendLine(container, `Relative Azimuth: ${fixed(radiansToGon(result.relativeAzimuth), 4)}ᵍ`);
    appendLine(container, `Zenith Angle: ${fixed(radiansToGon(result.zenithAngle), 4)}ᵍ`);
    appendLine(container);
    appendLine(container, 'Heights:', true);
    appendLine(container, `Station Ground Height: ${fixed(result.stationGroundElevation)} meters`);
    appendLine(container, `Station Instrument Height: ${fixed(result.instrumentHeight)} meters`);
    appendLine(container, `Target Ground Height: ${fixed(result.targetGroundElevation)} meters`);
    appendLine(container, `Target Prism Height: ${fixed(result.targetHeight)} meters`);
    appendLine(container, `Mean Ground Height: ${fixed(result.meanGroundHeight)} meters`);
}
function calculate() {
    try {
        const stationId = element('stationPoint').value;
        const targetId = element('targetPoint').value;
        const radius = element('earthRadius');
        radius.removeAttribute('aria-invalid');
        let earthRadius;
        try {
            earthRadius = kilometresToMetres(validateConfigurationNumber(radius.value, 'Earth radius', { positive: true }));
        } catch (error) {
            radius.setAttribute('aria-invalid', 'true');
            throw error;
        }
        // The original CSV h column supplies role-specific defaults. The numerical API
        // still accepts independent heights for each setup and target observation.
        const added = appendStakeout(project, {
            stationId,
            orientationId: element('orientPoint').value,
            targetId,
            instrumentHeight: defaultPointHeight(project, stationId, 'instrument'),
            targetHeight: defaultPointHeight(project, targetId, 'target'),
            earthRadius
        });
        project = added.project;
        clearFileWarning();
        renderResult(added.entry);
        renderFieldbook();
    } catch (error) {
        reportError(error, 'Fieldbook row not added. ');
    }
}
element('loadPoints').addEventListener('click', () => {
    readSequence++;
    try { loadInput(element('pointInput').value, 'Manual points.csv'); }
    catch (error) { reportError(error, 'Import cancelled; the loaded points and fieldbook are unchanged.\n'); }
});
element('pointInput').addEventListener('input', () => { readSequence++; });
element('fileInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    const sequence = ++readSequence;
    if (!file) return;
    try {
        if (file.size > 10 * 1024 * 1024) throw new RangeError('Maximum input size: 10 MB.');
        const text = await file.text();
        if (sequence !== readSequence) return;
        loadInput(text, file.name);
    } catch (error) {
        if (sequence === readSequence) reportError(error, 'Import cancelled; the loaded points and fieldbook are unchanged.\n');
    } finally { event.target.value = ''; }
});
for (const id of ['stationPoint', 'orientPoint', 'targetPoint']) {
    element(id).addEventListener('change', () => element('polarResult').replaceChildren());
}
element('earthRadius').addEventListener('input', () => {
    element('earthRadius').removeAttribute('aria-invalid');
    element('polarResult').replaceChildren();
});
element('calculatePolar').addEventListener('click', calculate);
element('downloadFieldbookCSV').addEventListener('click', () => {
    try {
        const url = URL.createObjectURL(new Blob([fieldbookToCsv(project.fieldbook, project.revision)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'fieldbook.csv';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) { reportError(error); }
});
