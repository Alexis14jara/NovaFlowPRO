document.addEventListener("DOMContentLoaded", async () => {
    // --- Global State ---
    let appState = {
        pin: null,
        pinRequired: true,
        tags: [],
        selectedTags: new Set(),
    };

    // --- Elements ---
    const pinOverlay = document.getElementById("pin-overlay");
    const pinInput = document.getElementById("pin-input");
    const pinTitle = document.getElementById("pin-title");
    const pinDesc = document.getElementById("pin-desc");
    const pinSubmit = document.getElementById("pin-submit");
    const pinError = document.getElementById("pin-error");
    const pinToggle = document.getElementById("pin-required-toggle");

    // Campaign Elements
    const nameInput = document.getElementById("campaign-name");
    const poolContainer = document.getElementById("message-pool");
    const btnAddMsg = document.getElementById("btn-add-msg");
    const tagsWrapper = document.getElementById("tags-wrapper");
    const contactsInput = document.getElementById("contacts");
    const btnAddTag = document.getElementById("btn-add-tag");

    // History Elements
    const histFilterText = document.getElementById("hist-filter-text");
    const histFilterTag = document.getElementById("hist-filter-tag");
    const btnExport = document.getElementById("btn-export-csv");

    // Tag Modal
    const tagModal = document.getElementById("tag-creation-modal");
    const newTagName = document.getElementById("new-tag-name");
    const tagColorContainer = document.getElementById("tag-color-picker");
    const btnSaveTag = document.getElementById("btn-save-tag");
    const btnCancelTag = document.getElementById("btn-cancel-tag");
    let selectedTagColor = "#25D366"; // Default

    // Tooltip
    const smartTooltip = document.getElementById("smart-tooltip");

    // Controls
    const startBtn = document.getElementById("start-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const stopBtn = document.getElementById("stop-btn");
    const resumeBtn = document.getElementById("resume-btn");
    const minDelayInput = document.getElementById("min-delay");
    const maxDelayInput = document.getElementById("max-delay");
    const limitInput = document.getElementById("limit");

    // --- INIT ---
    const storage = await chrome.storage.local.get([
        "pin",
        "tags",
        "pinRequired",
    ]);
    appState.tags = storage.tags || [];
    appState.pin = storage.pin;
    appState.pinRequired = storage.pinRequired !== false; // Default true

    renderTags();
    renderTagOptions();

    // Security Check
    pinToggle.checked = appState.pinRequired;
    if (appState.pinRequired && appState.pin) {
        // Show Login
        pinOverlay.style.display = "flex";
        pinSubmit.onclick = () => {
            if (pinInput.value === appState.pin) unlockApp();
            else showError("PIN Incorrecto");
        };
    } else if (appState.pinRequired && !appState.pin) {
        // Setup First Time
        pinOverlay.style.display = "flex";
        pinTitle.innerText = "Crear PIN Nuevo";
        pinDesc.innerText = "Define tu código de acceso";
        pinSubmit.innerText = "Guardar PIN";
        pinSubmit.onclick = async () => {
            const val = pinInput.value;
            if (val.length < 4) {
                showError("Mínimo 4 dígitos");
                return;
            }
            await chrome.storage.local.set({ pin: val });
            appState.pin = val;
            unlockApp();
        };
    } else {
        pinOverlay.style.display = "none";
        checkCampaignStatus();
    }

    pinInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") pinSubmit.click();
    });

    function unlockApp() {
        pinOverlay.style.animation = "fadeOut 0.3s";
        setTimeout(() => {
            pinOverlay.style.display = "none";
            checkCampaignStatus();
        }, 280);
    }
    function showError(msg) {
        pinError.innerText = msg;
        pinError.style.display = "block";
        pinInput.value = "";
        pinInput.focus();
    }

    // --- SECURITY SETTINGS ---
    pinToggle.addEventListener("change", async (e) => {
        const isChecked = e.target.checked;
        if (!appState.pin && isChecked) {
            alert(
                "Primero debes configurar un PIN en la opción 'Cambiar PIN'."
            );
            e.target.checked = false;
            return;
        }
        await chrome.storage.local.set({ pinRequired: isChecked });
        appState.pinRequired = isChecked;
    });

    // --- CHANGE PIN LOGIC (New Modal) ---
    const modalChangePin = document.getElementById("modal-change-pin");
    const inputOldPin = document.getElementById("old-pin");
    const inputNewPin = document.getElementById("new-pin");
    const btnCancelPin = document.getElementById("btn-cancel-pin");
    const btnSavePin = document.getElementById("btn-save-pin");

    document.getElementById("btn-change-pin").addEventListener("click", () => {
        inputOldPin.value = "";
        inputNewPin.value = "";
        modalChangePin.classList.add("active");
        inputOldPin.focus();
    });

    btnCancelPin.addEventListener("click", () => {
        modalChangePin.classList.remove("active");
    });

    btnSavePin.addEventListener("click", async () => {
        const oldP = inputOldPin.value;
        const newP = inputNewPin.value;

        if (appState.pin && oldP !== appState.pin) {
            alert("PIN actual incorrecto"); // Fallback to alert for simplicity inside modal or use toast
            // Ideally use showModal here but for context keep simple
            return;
        }
        if (!newP || newP.length < 4) {
            alert("El nuevo PIN debe tener al menos 4 dígitos");
            return;
        }

        await chrome.storage.local.set({ pin: newP });
        appState.pin = newP;
        modalChangePin.classList.remove("active");
        showModal("Éxito", "PIN actualizado correctamente", "🔐");
    });

    // --- SMART TOOLTIPS ---
    const tooltips = document.querySelectorAll(".info-icon");
    if (tooltips.length > 0) {
        tooltips.forEach((icon) => {
            icon.addEventListener("mouseenter", (e) => {
                const rect = icon.getBoundingClientRect();
                smartTooltip.querySelector("h5").innerText =
                    icon.getAttribute("data-title");
                smartTooltip.querySelector("p").innerText =
                    icon.getAttribute("data-desc");
                smartTooltip.classList.add("active");

                // Calculate position (Fixed)
                // Center above the icon
                const tooltipWidth = smartTooltip.offsetWidth || 220;
                const top = rect.top - smartTooltip.offsetHeight - 10;
                const left = rect.left - tooltipWidth / 2 + rect.width / 2;

                smartTooltip.style.top = `${Math.max(10, top)}px`; // Prevent going off top
                smartTooltip.style.left = `${Math.max(
                    10,
                    Math.min(left, window.innerWidth - tooltipWidth - 10)
                )}px`; // Prevent side overflow
            });
            icon.addEventListener("mouseleave", () => {
                smartTooltip.classList.remove("active");
            });
            // Also close on click just in case
            icon.addEventListener("click", (e) => e.stopPropagation());
        });
        document.addEventListener("click", () =>
            smartTooltip.classList.remove("active")
        );
    }

    // --- TAG MODAL LOGIC ---
    // Color Picker Selection
    Array.from(tagColorContainer.children).forEach((circle) => {
        circle.addEventListener("click", () => {
            Array.from(tagColorContainer.children).forEach((c) =>
                c.classList.remove("selected")
            );
            circle.classList.add("selected");
            selectedTagColor = circle.getAttribute("data-color");
        });
    });
    // Add Tag Button
    btnAddTag.addEventListener("click", () => {
        newTagName.value = "";
        tagModal.classList.add("active");
    });
    btnCancelTag.addEventListener("click", () =>
        tagModal.classList.remove("active")
    );

    btnSaveTag.addEventListener("click", async () => {
        const name = newTagName.value.trim();
        if (!name) return;

        const newTag = { id: Date.now(), name, color: selectedTagColor };
        appState.tags.push(newTag);
        await chrome.storage.local.set({ tags: appState.tags });

        renderTags();
        renderTagOptions();
        tagModal.classList.remove("active");
    });

    // --- CONTROL BUTTONS LISTENERS ---
    if (pauseBtn)
        pauseBtn.addEventListener("click", () =>
            sendControlAction("PAUSE_CAMPAIGN")
        );
    if (stopBtn)
        stopBtn.addEventListener("click", () =>
            sendControlAction("STOP_CAMPAIGN")
        );
    if (resumeBtn)
        resumeBtn.addEventListener("click", () =>
            sendControlAction("RESUME_CAMPAIGN")
        );

    function sendControlAction(action) {
        chrome.runtime.sendMessage({ action: action }, (res) => {
            if (res && res.status) {
                // Status update will come via onMessage or we can force check
                checkCampaignStatus();
            }
        });
    }

    function renderTags() {
        Array.from(tagsWrapper.children).forEach((c) => {
            if (c.id !== "btn-add-tag") c.remove();
        });
        appState.tags.forEach((tag) => {
            const el = document.createElement("span");
            el.className = "tag-badge";
            el.style.backgroundColor = tag.color;
            el.style.display = "inline-flex";
            el.style.alignItems = "center";
            el.style.gap = "4px";

            if (appState.selectedTags.has(tag.id)) el.classList.add("selected");

            // Tag Name
            const txt = document.createElement("span");
            txt.innerText = tag.name;
            el.appendChild(txt);

            // Delete Button (X)
            const delBtn = document.createElement("span");
            delBtn.innerText = "×";
            delBtn.style.cursor = "pointer";
            delBtn.style.fontWeight = "bold";
            delBtn.style.marginLeft = "4px";
            delBtn.style.opacity = "0.7";
            delBtn.title = "Eliminar Etiqueta";
            delBtn.onmouseover = () => (delBtn.style.opacity = "1");
            delBtn.onmouseout = () => (delBtn.style.opacity = "0.7");

            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (
                    await showModal(
                        "Eliminar",
                        `¿Borrar "${tag.name}"?`,
                        "🗑️",
                        true
                    )
                ) {
                    appState.tags = appState.tags.filter(
                        (t) => t.id !== tag.id
                    );
                    appState.selectedTags.delete(tag.id);
                    await chrome.storage.local.set({ tags: appState.tags });
                    renderTags();
                    renderTagOptions();
                }
            };
            el.appendChild(delBtn);

            // Selection Click (Only if not removing)
            el.onclick = (e) => {
                if (e.target === delBtn) return;
                if (appState.selectedTags.has(tag.id))
                    appState.selectedTags.delete(tag.id);
                else appState.selectedTags.add(tag.id);
                el.classList.toggle("selected");
            };

            el.oncontextmenu = (e) => e.preventDefault(); // Disable default context menu as we now have X button
            tagsWrapper.insertBefore(el, btnAddTag);
        });
    }
    function renderTagOptions() {
        histFilterTag.innerHTML = '<option value="">Etiqueta</option>';
        appState.tags.forEach((tag) => {
            const opt = document.createElement("option");
            opt.value = tag.id;
            opt.innerText = tag.name;
            histFilterTag.appendChild(opt);
        });
    }

    // --- MESSAGE POOL ---
    btnAddMsg.addEventListener("click", () => addPoolItem());
    function addPoolItem(content = "") {
        const div = document.createElement("div");
        div.className = "pool-item";
        div.innerHTML = `
            <textarea class="message-input" rows="3" placeholder="Mensaje alternativo...">${content}</textarea>
            <button class="btn-remove-msg" title="Eliminar">✕</button>
        `;
        div.querySelector(".btn-remove-msg").addEventListener("click", () =>
            div.remove()
        );
        poolContainer.appendChild(div);
    }
    function getPoolMessages() {
        return Array.from(poolContainer.querySelectorAll("textarea"))
            .map((t) => t.value.trim())
            .filter(Boolean);
    }
    function setPoolMessages(msgs) {
        poolContainer.innerHTML = "";
        if (!msgs || msgs.length === 0) addPoolItem();
        else msgs.forEach((m) => addPoolItem(m));
    }

    // --- HISTORY & REPORTS ---
    // History Elements
    const histFilterDate = document.getElementById("hist-filter-date");

    async function loadHistory() {
        const data = await chrome.storage.local.get("history");
        let history = data.history || [];
        const searchText = histFilterText.value.toLowerCase();
        const tagFilter = histFilterTag.value;
        const dateFilter = histFilterDate.value; // YYYY-MM-DD

        history = history.filter((item) => {
            // Text Match
            const matchesText =
                (item.name || "").toLowerCase().includes(searchText) ||
                (item.date || "").toLowerCase().includes(searchText); // fallback

            // Tag Match
            const matchesTag = tagFilter
                ? item.tags && item.tags.some((t) => t.id == tagFilter)
                : true;

            // Date Match
            let matchesDate = true;
            if (dateFilter) {
                // item.id should be the timestamp
                const itemDate = new Date(parseInt(item.id));
                if (!isNaN(itemDate.getTime())) {
                    // Create local YYYY-MM-DD string from item timestamp
                    const y = itemDate.getFullYear();
                    const m = String(itemDate.getMonth() + 1).padStart(2, "0");
                    const d = String(itemDate.getDate()).padStart(2, "0");
                    const itemDateStr = `${y}-${m}-${d}`;
                    matchesDate = itemDateStr === dateFilter;
                }
            }

            return matchesText && matchesTag && matchesDate;
        });

        const listContainer = document.getElementById("history-list");
        listContainer.innerHTML = "";

        if (history.length === 0) {
            listContainer.innerHTML =
                '<div style="text-align:center; color: var(--text-muted); padding: 20px;">No se encontraron resultados</div>';
            return;
        }

        history.forEach((item) => {
            const el = document.createElement("div");
            el.className = "history-item";
            let tagsHtml = "";
            if (item.tags) {
                item.tags.forEach(
                    (t) =>
                        (tagsHtml += `<span style="font-size:0.6rem; padding:1px 4px; background:${t.color}; border-radius:4px; margin-right:3px;">${t.name}</span>`)
                );
            }
            el.innerHTML = `
                <div class="history-info">
                    <h4>${
                        item.name || "Sin Nombre"
                    } <span style="font-weight:400; font-size:0.8rem; opacity:0.7">${
                item.date
            }</span></h4>
                    <div style="margin-top:2px;">${tagsHtml}</div>
                    <span class="status-badge finished">Enviados: ${
                        item.sent
                    }/${item.total}</span>
                </div>
                <div class="history-actions">
                    <button class="icon-btn view-btn" title="Ver Reporte Online">👁️</button>
                    <button class="icon-btn download-btn" title="Descargar CSV">📥</button>
                    <button class="icon-btn edit-btn" title="Reutilizar">♻️</button>
                    <button class="icon-btn del-btn" title="Eliminar">🗑️</button>
                </div>
            `;
            el.querySelector(".view-btn").addEventListener("click", () =>
                openReportPage(item)
            );
            el.querySelector(".download-btn").addEventListener("click", () =>
                downloadSingleReport(item)
            );
            el.querySelector(".edit-btn").addEventListener("click", () =>
                loadCampaignIntoForm(item)
            );
            el.querySelector(".del-btn").addEventListener("click", async () => {
                if (await showModal("Elimnar", "¿Seguro?", "🗑️", true)) {
                    const newData = await chrome.storage.local.get("history");
                    const newHist = (newData.history || []).filter(
                        (h) => h.id !== item.id
                    );
                    await chrome.storage.local.set({ history: newHist });
                    loadHistory();
                }
            });
            listContainer.appendChild(el);
        });
    }

    histFilterText.addEventListener("input", loadHistory);
    histFilterTag.addEventListener("change", loadHistory);
    histFilterDate.addEventListener("change", loadHistory);

    // --- MESSAGING ---
    chrome.runtime.onMessage.addListener(async (req) => {
        if (req.action === "UPDATE_STATS") {
            document.getElementById("stat-sent").innerText = req.stats.sent;
            document.getElementById("stat-pending").innerText =
                req.stats.pending;
            document.getElementById("stat-failed").innerText = req.stats.failed;
            if (req.hasOwnProperty("isRunning"))
                updateButtonState(req.isRunning, req.isPaused);
        } else if (req.action === "UPDATE_COUNTDOWN") {
            // NEW: Countdown Logic
            const wrapper = document.getElementById("countdown-wrapper");
            if (wrapper) wrapper.style.display = "block";
            document.getElementById("time-estimate").innerText = req.seconds;

            // Update Total Time (Decrease recursively is hard, just re-calc or keep static? let's keep static total)
        } else if (req.action === "CAMPAIGN_FINISHED") {
            updateButtonState(false, false);
            document.getElementById("countdown-wrapper").style.display = "none";
            if (
                !req.wasStopped &&
                (await showModal("Fin", "Ver reporte?", "🎉", true))
            ) {
                loadHistory();
                document.querySelector('.nav-btn[data-tab="history"]').click();
            }
        } else if (req.action === "INTERNET_DISCONNECTED") {
            showModal(
                "Internet",
                "Se perdió la conexión. Campaña Pausada.",
                "📡"
            );
            updateButtonState(true, true); // Force Pause State UI
        } else if (req.action === "SHOW_ALERT") {
            showModal(req.title, req.msg, req.icon || "⚠️");
        }
    });

    // ... (checkCampaignStatus remains same)

    // Single Report Download (Fixed CSV)
    function downloadSingleReport(item) {
        let csv = "\uFEFFTelefono;Estado;Error;MensajeUsado;Hora\n"; // Added BOM and ;
        if (item.details) {
            item.details.forEach((d) => {
                // Sanitize
                const cleanMsg = (d.msg_used || "")
                    .replace(/[\r\n]+/g, " ")
                    .replace(/"/g, '""');
                csv += `${d.phone};${
                    d.status === "ok" ? "Enviado" : "Fallido"
                };${d.error || ""};"${cleanMsg}";${d.time}\n`;
            });
        }
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `reporte_${(item.name || "campania").replace(/\s+/g, "_")}_${
                item.id
            }.csv` // Safe filename
        );
        document.body.appendChild(link);
        link.click();
    }

    // View Report Page (New)
    function openReportPage(item) {
        chrome.tabs.create({
            url: chrome.runtime.getURL(`report.html?id=${item.id}`),
        });
    }

    // Full Export (Fixed)
    btnExport.addEventListener("click", async () => {
        const data = await chrome.storage.local.get("history");
        const history = data.history || [];
        let csvContent = "\uFEFFID;Fecha;Nombre;Enviados;Total;Estado\n";
        history.forEach((row) => {
            csvContent += `${row.id};${row.date};"${(row.name || "").replace(
                /"/g,
                '""'
            )}";${row.sent};${row.total};${row.status}\n`;
        });
        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "novaflow_reportes_full.csv");
        document.body.appendChild(link);
        link.click();
    });

    async function loadCampaignIntoForm(item) {
        document.querySelector('.nav-btn[data-tab="campaign"]').click();
        nameInput.value = item.name || "";
        if (item.pool) setPoolMessages(item.pool);
        else setPoolMessages([item.message]);

        appState.selectedTags = new Set();
        if (item.tags)
            item.tags.forEach((t) => appState.selectedTags.add(t.id));
        renderTags();

        await showModal(
            "Datos Restaurados",
            "Configuración restaurada. Pega los contactos nuevamente.",
            "♻️"
        );
    }

    // --- CAMPAIGN START LOGIC ---
    startBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const msgs = getPoolMessages();
        const contactsRaw = contactsInput.value.trim();
        let minDelay = parseInt(minDelayInput.value);
        let maxDelay = parseInt(maxDelayInput.value);
        const limit = parseInt(limitInput.value);

        if (msgs.length === 0) {
            showModal("Error", "Debes tener al menos un mensaje.", "✍️");
            return;
        }
        if (!contactsRaw) {
            showModal("Error", "Lista de contactos vacía.", "📋");
            return;
        }
        if (minDelay > maxDelay) {
            const t = min;
            min = max;
            max = t;
            minDelayInput.value = min;
            maxDelayInput.value = max;
        }

        const rawList = contactsRaw
            .split(/[\n,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const validContacts = [];
        rawList.forEach((c) => {
            let clean = c.replace(/\D/g, "");
            if (clean.length >= 10) validContacts.push(clean);
        });

        if (validContacts.length === 0) {
            showModal("Error", "No hay números válidos.", "🚫");
            return;
        }
        if (validContacts.length > limit) {
            if (
                !(await showModal(
                    "Límite",
                    `Se limitará a ${limit} contactos.`,
                    "✂️",
                    true
                ))
            )
                return;
            validContacts.length = limit;
        }

        const campaignTags = appState.tags.filter((t) =>
            appState.selectedTags.has(t.id)
        );
        updateButtonState(true, false);

        // Calculate Total Est Time
        const avgDelay = (minDelay + maxDelay) / 2;
        const totalSeconds = validContacts.length * avgDelay;
        const min = Math.floor(totalSeconds / 60);
        const sec = Math.ceil(totalSeconds % 60);
        document.getElementById("time-total").innerText = `${min}m ${sec}s`;

        chrome.runtime.sendMessage({
            action: "START_CAMPAIGN",
            payload: {
                name: name,
                contacts: validContacts,
                pool: msgs,
                tags: campaignTags,
                settings: { minDelay, maxDelay, limit },
            },
        });
    });

    function updateButtonState(isRunning, isPaused) {
        startBtn.style.display = "none";
        pauseBtn.style.display = "none";
        stopBtn.style.display = "none";
        resumeBtn.style.display = "none";

        if (!isRunning && !isPaused) startBtn.style.display = "flex";
        else if (isRunning && !isPaused) {
            pauseBtn.style.display = "flex";
            stopBtn.style.display = "flex";
        } else if (!isRunning && isPaused) {
            resumeBtn.style.display = "flex";
            stopBtn.style.display = "flex";
        }
    }

    // --- TABS & EVENTS ---
    document.querySelectorAll(".nav-btn").forEach((t) =>
        t.addEventListener("click", () => {
            document
                .querySelectorAll(".nav-btn")
                .forEach((b) => b.classList.remove("active"));
            document
                .querySelectorAll(".tab-content")
                .forEach((c) => c.classList.remove("active"));
            t.classList.add("active");
            document
                .getElementById(t.getAttribute("data-tab"))
                .classList.add("active");
            if (t.getAttribute("data-tab") === "history") loadHistory();
        })
    );

    const helpWrapper = document.querySelector(".help-wrapper");
    const helpTooltip = document.getElementById("help-tooltip");
    helpWrapper.addEventListener("mouseenter", () =>
        helpTooltip.classList.add("active")
    );
    helpWrapper.addEventListener("mouseleave", () =>
        helpTooltip.classList.remove("active")
    );
    document.getElementById("btn-support").onclick = () =>
        window.open("https://wa.me/595992489510?text=Hola,%20necesito%20ayuda.%20con%20NovaFlow%20Pro", "_blank");

    function checkCampaignStatus() {
        chrome.runtime.sendMessage({ action: "GET_STATUS" }, (res) => {
            if (res) {
                updateButtonState(res.isRunning, res.isPaused);
                document.getElementById("stat-sent").innerText = res.stats.sent;
                document.getElementById("stat-pending").innerText =
                    res.stats.pending;
                document.getElementById("stat-failed").innerText =
                    res.stats.failed;
            }
        });
    }

    // Modal Helpers
    const modalOverlay = document.getElementById("custom-modal");
    function showModal(title, msg, icon = "⚠️", isConfirm = false) {
        return new Promise((resolve) => {
            document.getElementById("modal-title").innerText = title;
            document.getElementById("modal-message").innerText = msg;
            document.getElementById("modal-icon").innerText = icon;
            const btnConfirm = document.getElementById("modal-confirm");
            const btnCancel = document.getElementById("modal-cancel");

            btnConfirm.onclick = () => {
                modalOverlay.classList.remove("active");
                resolve(true);
            };
            if (isConfirm) {
                btnCancel.style.display = "block";
                btnCancel.onclick = () => {
                    modalOverlay.classList.remove("active");
                    resolve(false);
                };
            } else {
                btnCancel.style.display = "none";
            }
            modalOverlay.classList.add("active");
        });
    }
    // --- Dynamic Time Estimation ---
    const timeTotalDisplay = document.getElementById("time-total");

    function updateTimeEstimate() {
        const text = contactsInput.value;
        const count = text
            .split("\n")
            .filter((l) => l.trim().length > 5).length;

        if (count === 0) {
            timeTotalDisplay.innerText = "--:--";
            return;
        }

        const min = parseInt(minDelayInput.value) || 5;
        const max = parseInt(maxDelayInput.value) || 15;
        const avgDelay = (min + max) / 2;

        // Est: Messages * AvgDelay
        const totalSeconds = Math.ceil(count * avgDelay);

        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        timeTotalDisplay.innerText = `${m}m ${s}s`;
    }

    contactsInput.addEventListener("input", updateTimeEstimate);
    minDelayInput.addEventListener("change", updateTimeEstimate);
    maxDelayInput.addEventListener("change", updateTimeEstimate);
});
