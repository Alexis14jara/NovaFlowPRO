document.addEventListener("DOMContentLoaded", async () => {
    // Event Listener Cerrar
    const closeBtn = document.getElementById("close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => window.close());
    }

    // Obtener ID de la URL
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
        document.body.innerHTML =
            "<h2 style='color:white;text-align:center;padding:20px'>Error: ID de campaña no especificado</h2>";
        return;
    }

    // Cargar datos
    const data = await chrome.storage.local.get("history");
    const history = data.history || [];
    const campaign = history.find((c) => c.id == id);

    if (!campaign) {
        document.body.innerHTML =
            "<h2 style='color:white;text-align:center;padding:20px'>Campaña no encontrada</h2>";
        return;
    }

    // Renderizar Header
    document.getElementById("campaign-date").innerText = campaign.date;
    document.getElementById("total-sent").innerText = campaign.sent;
    document.getElementById("total-failed").innerText = campaign.failed;
    document.getElementById("total-count").innerText = campaign.total;

    // Renderizar Tabla
    const tbody = document.getElementById("report-body");
    const details = campaign.details || [];

    if (details.length === 0) {
        tbody.innerHTML =
            "<tr><td colspan='4' style='text-align:center; color:#666;'>No hay detalles registrados para esta campaña.</td></tr>";
        return;
    }

    details.forEach((item) => {
        const tr = document.createElement("tr");

        const statusHtml =
            item.status === "ok"
                ? '<span class="status-ok">✔ Enviado</span>'
                : '<span class="status-fail">✘ Error</span>';

        const errorHtml = item.error
            ? `<span class="error-msg">${item.error}</span>`
            : "-";

        tr.innerHTML = `
            <td>${item.phone}</td>
            <td class="timestamp">${item.time || "-"}</td>
            <td>${statusHtml}</td>
            <td>${errorHtml}</td>
        `;
        tbody.appendChild(tr);
    });
});
