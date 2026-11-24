
"use strict";

// ==========================================
// STRONGTRACK V2.0
// ==========================================

const STORAGE_KEY = "strongtrack_workouts";

const fixedWeights = {
    "Press banca": 80,
    "Remo polea baja": 77,
    "Leg press": 244
};

const $ = id => document.getElementById(id);

let workouts = loadWorkouts();
let performanceChart = null;
let comparisonChart = null;
let toastTimer = null;

// ==========================================
// ALMACENAMIENTO Y COMPATIBILIDAD
// ==========================================

function loadWorkouts() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

        if (!Array.isArray(saved)) return [];

        return saved.map(item => ({
            ...item,
            id: item.id || Date.now() + Math.random(),
            type: item.type || "official",
            phase: item.phase || "Control",
            sets: Number(item.sets ?? 1),
            weight: Number(item.weight ?? 0),
            reps: Number(item.reps ?? 0),
            sleep: item.sleep === null || item.sleep === undefined
                ? null : Number(item.sleep),
            energy: item.energy === null || item.energy === undefined
                ? null : Number(item.energy),
            observations: item.observations || "",
            date: item.date || new Date().toISOString()
        }));
    } catch (error) {
        console.error("Error leyendo los datos:", error);
        alert("No se han podido leer los registros guardados. No guardes nuevos datos hasta revisar el almacenamiento.");
        return [];
    }
}

function saveWorkouts() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
        return true;
    } catch (error) {
        console.error(error);
        showToast("No se pudieron guardar los datos. Comprueba el almacenamiento.");
        return false;
    }
}

// ==========================================
// UTILIDADES
// ==========================================

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function formatDate(date) {
    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return "Fecha desconocida";

    return parsed.toLocaleDateString("es-ES");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverage(value) {
    return value === null ? "--" : value.toFixed(2);
}

function getSortedRecords(records) {
    return [...records].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );
}

// ==========================================
// NAVEGACIÓN
// ==========================================

function showSection(sectionId) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.toggle("active", section.id === sectionId);
    });

    document.querySelectorAll(".nav-button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === sectionId
        );
    });

    if (sectionId === "analysis") renderAnalysis();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
        showSection(button.dataset.section);
    });
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
        showSection(button.dataset.go);
    });
});

// ==========================================
// FORMULARIO
// ==========================================

function openModal(record = null) {
    $("recordForm").reset();
    $("recordId").value = "";

    if (record) {
        $("formTitle").textContent = "Editar registro";

        $("recordId").value = record.id;
        $("recordType").value = record.type;
        $("phase").value = record.phase;

        const knownExercises = [
            "Press banca",
            "Remo polea baja",
            "Leg press"
        ];

        if (knownExercises.includes(record.exercise)) {
            $("exercise").value = record.exercise;
            $("otherExercise").value = "";
        } else {
            $("exercise").value = "Otro";
            $("otherExercise").value = record.exercise;
        }

        $("weight").value = record.weight;
        $("sets").value = record.sets;
        $("reps").value = record.reps;
        $("sleep").value = record.sleep ?? "";
        $("energy").value = record.energy ?? "";
        $("observations").value = record.observations || "";
    } else {
        $("formTitle").textContent = "Nuevo registro";
        $("recordType").value = "official";
        $("phase").value = "Control";
    }

    updateForm();
    $("recordModal").classList.remove("hidden");
}

function closeModal() {
    $("recordModal").classList.add("hidden");
}

$("newRecordButton").addEventListener("click", () => openModal());
$("closeModal").addEventListener("click", closeModal);
$("cancelModal").addEventListener("click", closeModal);

$("recordModal").addEventListener("click", event => {
    if (event.target === $("recordModal")) closeModal();
});

$("recordType").addEventListener("change", updateForm);
$("exercise").addEventListener("change", updateForm);

function updateForm() {
    const official = $("recordType").value === "official";
    const exerciseName = $("exercise").value;
    const isEditing = Boolean($("recordId").value);

    $("officialFields").classList.toggle("hidden", !official);
    $("dailyFields").classList.toggle("hidden", official);

    $("fixedWeightInfo").classList.toggle(
        "hidden",
        !official || !fixedWeights[exerciseName]
    );

    $("otherExerciseWrapper").classList.toggle(
        "hidden",
        exerciseName !== "Otro"
    );

    $("repsLabel").textContent = official
        ? "Repeticiones al fallo"
        : "Repeticiones";

    $("sets").required = !official;
    $("sleep").required = official;
    $("energy").required = official;

    // No sobrescribir el peso al editar un registro.
    if (official && fixedWeights[exerciseName] && !isEditing) {
        $("weight").value = fixedWeights[exerciseName];
        $("weight").readOnly = true;
    } else if (official && fixedWeights[exerciseName] && isEditing) {
        $("weight").readOnly = false;
    } else {
        $("weight").readOnly = false;
    }
}

// ==========================================
// GUARDAR REGISTRO
// ==========================================

$("recordForm").addEventListener("submit", event => {
    event.preventDefault();

    const official = $("recordType").value === "official";
    const editingId = $("recordId").value;

    let selectedExercise = $("exercise").value;

    if (selectedExercise === "Otro") {
        selectedExercise = $("otherExercise").value.trim();

        if (!selectedExercise) {
            showToast("Escribe el nombre del ejercicio.");
            return;
        }
    }

    const weight = Number($("weight").value);
    const reps = Number($("reps").value);
    const sets = official ? 1 : Number($("sets").value);
    const sleep = official ? Number($("sleep").value) : null;
    const energy = official ? Number($("energy").value) : null;

    if (!selectedExercise || !Number.isFinite(weight) || weight < 0 ||
        !Number.isInteger(reps) || reps < 1) {
        showToast("Revisa los datos introducidos.");
        return;
    }

    if (!official && (!Number.isInteger(sets) || sets < 1)) {
        showToast("Introduce un número válido de series.");
        return;
    }

    if (official && (
        !Number.isFinite(sleep) || sleep < 0 || sleep > 24 ||
        !Number.isInteger(energy) || energy < 0 || energy > 10
    )) {
        showToast("Revisa las horas de sueño y el nivel de energía.");
        return;
    }

    const previous = editingId
        ? workouts.find(item => String(item.id) === editingId)
        : null;

    const entry = {
        id: previous ? previous.id : Date.now() + Math.random(),
        type: $("recordType").value,
        phase: $("phase").value,
        exercise: selectedExercise,
        weight,
        reps,
        sets,
        sleep,
        energy,
        observations: $("observations").value.trim(),
        date: previous ? previous.date : new Date().toISOString()
    };

    const oldWorkouts = [...workouts];

    if (previous) {
        workouts = workouts.map(item =>
            String(item.id) === editingId ? entry : item
        );
    } else {
        workouts.push(entry);
    }

    if (!saveWorkouts()) {
        workouts = oldWorkouts;
        return;
    }

    closeModal();
    updateDashboard();
    showToast(previous ? "Registro actualizado." : "Registro guardado.");
});

// ==========================================
// EDITAR Y ELIMINAR
// ==========================================

function editRecord(id) {
    const record = workouts.find(item => String(item.id) === String(id));
    if (record) openModal(record);
}

function deleteRecord(id) {
    const record = workouts.find(item => String(item.id) === String(id));
    if (!record) return;

    if (!confirm(`¿Eliminar el registro de ${record.exercise}?`)) return;

    const oldWorkouts = [...workouts];

    workouts = workouts.filter(
        item => String(item.id) !== String(id)
    );

    if (!saveWorkouts()) {
        workouts = oldWorkouts;
        return;
    }

    updateDashboard();
    showToast("Registro eliminado.");
}

function attachRecordActions(container) {
    container.querySelectorAll("[data-edit]").forEach(button => {
        button.addEventListener("click", () => {
            editRecord(button.dataset.edit);
        });
    });

    container.querySelectorAll("[data-delete]").forEach(button => {
        button.addEventListener("click", () => {
            deleteRecord(button.dataset.delete);
        });
    });
}

// ==========================================
// TARJETAS DE REGISTROS
// ==========================================

function createRecordCard(item, actions = false) {
    const card = document.createElement("article");
    card.className = "record-card";

    const typeLabel = item.type === "official"
        ? "Medida oficial"
        : "Entrenamiento diario";

    const extra = item.type === "official"
        ? `<p>Sueño: ${escapeHTML(item.sleep ?? "--")} h · Energía: ${escapeHTML(item.energy ?? "--")}/10</p>`
        : "";

    card.innerHTML = `
        <div class="record-top">
            <div>
                <h3>${escapeHTML(item.exercise)}</h3>
                <p>${formatDate(item.date)}</p>
            </div>
            <span class="record-badge">${escapeHTML(item.phase)}</span>
        </div>

        <p><strong>${escapeHTML(item.weight)} kg</strong> ·
        ${escapeHTML(item.reps)} repeticiones ·
        ${escapeHTML(item.sets)} series</p>

        <p>${typeLabel}</p>
        ${extra}

        ${item.observations
            ? `<p>Observaciones: ${escapeHTML(item.observations)}</p>`
            : ""}

        ${actions ? `
            <div class="record-actions">
                <button class="small-button" data-edit="${escapeHTML(item.id)}">Editar</button>
                <button class="small-button delete" data-delete="${escapeHTML(item.id)}">Eliminar</button>
            </div>
        ` : ""}
    `;

    return card;
}

function renderRecent() {
    const container = $("recentList");
    container.innerHTML = "";

    const recent = [...workouts]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);

    if (!recent.length) {
        container.innerHTML = `
            <div class="record-card">
                <h3>Sin registros todavía</h3>
                <p>Registra tu primera sesión para empezar.</p>
            </div>
        `;
        return;
    }

    recent.forEach(item => {
        container.appendChild(createRecordCard(item));
    });
}

// ==========================================
// HISTORIAL Y FILTROS
// ==========================================

function renderHistory() {
    const container = $("historyList");
    container.innerHTML = "";

    const phase = $("filterPhase").value;
    const exercise = $("filterExercise").value;
    const type = $("filterType").value;

    const filtered = [...workouts]
        .filter(item => phase === "all" || item.phase === phase)
        .filter(item => exercise === "all" || item.exercise === exercise)
        .filter(item => type === "all" || item.type === type)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!filtered.length) {
        container.innerHTML = `
            <div class="record-card">
                <p>No se encontraron registros con estos filtros.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(item => {
        container.appendChild(createRecordCard(item, true));
    });

    attachRecordActions(container);
}

["filterPhase", "filterExercise", "filterType"].forEach(id => {
    $(id).addEventListener("change", renderHistory);
});

// ==========================================
// DASHBOARD
// ==========================================

function updateDashboard() {
    const official = workouts.filter(item => item.type === "official");
    const daily = workouts.filter(item => item.type === "daily");

    $("totalRecords").textContent = workouts.length;
    $("officialRecords").textContent = official.length;
    $("dailyRecords").textContent = daily.length;

    const latest = [...workouts].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
    )[0];

    $("lastDate").textContent = latest
        ? formatDate(latest.date)
        : "--";

    renderRecent();
    renderHistory();
    renderAnalysis();
}

// ==========================================
// ANÁLISIS COMPARATIVO
// ==========================================

function getAnalysisRecords(exercise, type) {
    return workouts.filter(item =>
        item.exercise === exercise &&
        item.type === type
    );
}

function renderAnalysis() {
    const exercise = $("analysisExercise").value;
    const type = $("analysisType").value;

    const records = getAnalysisRecords(exercise, type);

    const control = records.filter(item => item.phase === "Control");
    const experimental = records.filter(item => item.phase === "Experimental");

    const controlMean = average(control.map(item => item.reps));
    const experimentalMean = average(experimental.map(item => item.reps));

    $("controlAverage").textContent = formatAverage(controlMean);
    $("experimentalAverage").textContent = formatAverage(experimentalMean);

    $("controlCount").textContent =
        `${control.length} ${control.length === 1 ? "medición" : "mediciones"}`;

    $("experimentalCount").textContent =
        `${experimental.length} ${experimental.length === 1 ? "medición" : "mediciones"}`;

    if (controlMean === null || experimentalMean === null) {
        $("absoluteDifference").textContent = "--";
        $("percentageDifference").textContent = "Sin datos suficientes";
        $("analysisInterpretation").textContent =
            "Necesitas al menos una medición en cada fase para realizar la comparación.";
    } else {
        const difference = experimentalMean - controlMean;

        $("absoluteDifference").textContent =
            `${difference > 0 ? "+" : ""}${difference.toFixed(2)} repeticiones`;

        if (controlMean === 0) {
            $("percentageDifference").textContent =
                "No se puede calcular el porcentaje porque la media de Control es 0.";
        } else {
            const percentage = difference / controlMean * 100;

            $("percentageDifference").textContent =
                `${percentage > 0 ? "+" : ""}${percentage.toFixed(2)} % respecto a Control`;
        }

        let interpretation;

        if (difference > 0) {
            interpretation = "La media de Experimental es superior en los registros disponibles.";
        } else if (difference < 0) {
            interpretation = "La media de Experimental es inferior en los registros disponibles.";
        } else {
            interpretation = "Las dos fases presentan la misma media.";
        }

        $("analysisInterpretation").textContent = interpretation;
    }

    renderPerformanceChart(records);
    renderComparisonChart(controlMean, experimentalMean);
}

// ==========================================
// GRÁFICA DE EVOLUCIÓN
// ==========================================

function renderPerformanceChart(records) {
    const canvas = $("performanceChart");

    if (performanceChart) {
        performanceChart.destroy();
        performanceChart = null;
    }

    if (!window.Chart) {
        $("chartMessage").textContent =
            "No se ha podido cargar Chart.js. Comprueba tu conexión.";
        return;
    }

    const sorted = getSortedRecords(records);

    if (!sorted.length) {
        $("chartMessage").textContent =
            "Todavía no hay registros para mostrar.";
        return;
    }

    $("chartMessage").textContent = "";

    const labels = sorted.map(item => formatDate(item.date));

    performanceChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Control",
                    data: sorted.map(item =>
                        item.phase === "Control" ? item.reps : null
                    ),
                    borderColor: "#ff8a24",
                    backgroundColor: "#ff8a24",
                    tension: 0.25,
                    spanGaps: false
                },
                {
                    label: "Experimental",
                    data: sorted.map(item =>
                        item.phase === "Experimental" ? item.reps : null
                    ),
                    borderColor: "#4da6ff",
                    backgroundColor: "#4da6ff",
                    tension: 0.25,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    labels: { color: "#fff" }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#aaa" },
                    grid: { color: "#333" }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Repeticiones",
                        color: "#aaa"
                    },
                    ticks: { color: "#aaa" },
                    grid: { color: "#333" }
                }
            }
        }
    });
}

// ==========================================
// GRÁFICA DE COMPARACIÓN
// ==========================================

function renderComparisonChart(controlMean, experimentalMean) {
    const canvas = $("comparisonChart");

    if (comparisonChart) {
        comparisonChart.destroy();
        comparisonChart = null;
    }

    if (!window.Chart) return;

    comparisonChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["Control", "Experimental"],
            datasets: [{
                label: "Media de repeticiones",
                data: [controlMean, experimentalMean],
                backgroundColor: ["#ff8a24", "#4da6ff"],
                borderRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: "#fff" },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: "#aaa" },
                    grid: { color: "#333" }
                }
            }
        }
    });
}

$("analysisExercise").addEventListener("change", renderAnalysis);
$("analysisType").addEventListener("change", renderAnalysis);

// ==========================================
// DESCARGAR ARCHIVOS
// ==========================================

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCSV() {
    if (!workouts.length) {
        showToast("No hay registros para exportar.");
        return;
    }

    const headers = [
        "Fecha",
        "Tipo",
        "Fase",
        "Ejercicio",
        "Peso kg",
        "Repeticiones",
        "Series",
        "Sueño horas",
        "Energía",
        "Observaciones"
    ];

    const rows = workouts.map(item => [
        formatDate(item.date),
        item.type,
        item.phase,
        item.exercise,
        item.weight,
        item.reps,
        item.sets,
        item.sleep ?? "",
        item.energy ?? "",
        item.observations
    ]);

    const csv = [
        headers.map(csvEscape).join(";"),
        ...rows.map(row => row.map(csvEscape).join(";"))
    ].join("\r\n");

    downloadFile(
        "\uFEFF" + csv,
        "STRONGTRACK_datos.csv",
        "text/csv;charset=utf-8;"
    );

    showToast("Archivo CSV descargado.");
}

$("exportCSV").addEventListener("click", exportCSV);

// ==========================================
// COPIA DE SEGURIDAD JSON
// ==========================================

$("exportJSON").addEventListener("click", () => {
    const backup = {
        application: "STRONGTRACK",
        version: "2.0",
        exportedAt: new Date().toISOString(),
        records: workouts
    };

    downloadFile(
        JSON.stringify(backup, null, 2),
        "STRONGTRACK_backup.json",
        "application/json"
    );

    showToast("Copia de seguridad creada.");
});

// ==========================================
// IMPORTAR COPIA JSON
// ==========================================

$("importButton").addEventListener("click", () => {
    $("importJSON").click();
});

$("importJSON").addEventListener("change", async event => {
    const file = event.target.files[0];

    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        const imported = Array.isArray(parsed)
            ? parsed
            : parsed.records;

        if (!Array.isArray(imported)) {
            throw new Error("Formato no válido.");
        }

        const valid = imported.every(item =>
            item &&
            typeof item.exercise === "string" &&
            Number.isFinite(Number(item.weight)) &&
            Number.isFinite(Number(item.reps)) &&
            ["Control", "Experimental"].includes(item.phase) &&
            ["official", "daily"].includes(item.type)
        );

        if (!valid) {
            throw new Error("La copia contiene registros no válidos.");
        }

        if (!confirm(
            "¿Quieres importar estos datos? Se añadirán a los registros actuales."
        )) {
            event.target.value = "";
            return;
        }

        const oldWorkouts = [...workouts];

        const importedRecords = imported.map(item => ({
            ...item,
            id: Date.now() + Math.random(),
            weight: Number(item.weight),
            reps: Number(item.reps),
            sets: Number(item.sets ?? 1),
            sleep: item.sleep == null ? null : Number(item.sleep),
            energy: item.energy == null ? null : Number(item.energy),
            date: item.date || new Date().toISOString()
        }));

        workouts = [...workouts, ...importedRecords];

        if (!saveWorkouts()) {
            workouts = oldWorkouts;
            return;
        }

        updateDashboard();
        showToast(`${importedRecords.length} registros importados.`);
    } catch (error) {
        console.error(error);
        showToast("No se pudo importar el archivo. Comprueba que sea una copia válida.");
    }

    event.target.value = "";
});

// ==========================================
// ELIMINAR TODOS LOS DATOS
// ==========================================

$("deleteAll").addEventListener("click", () => {
    if (!workouts.length) {
        showToast("No hay registros que eliminar.");
        return;
    }

    const confirmation = confirm(
        "¿Seguro que quieres eliminar TODOS los registros? Esta acción no se puede deshacer."
    );

    if (!confirmation) return;

    const oldWorkouts = [...workouts];
    workouts = [];

    if (!saveWorkouts()) {
        workouts = oldWorkouts;
        return;
    }

    updateDashboard();
    showToast("Todos los registros han sido eliminados.");
});

// ==========================================
// INSTALACIÓN PWA
// ==========================================

if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(() => console.log("Service Worker registrado."))
            .catch(error => console.error("Error PWA:", error));
    });
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

updateDashboard();
