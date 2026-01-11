let campaignState = {
    isRunning: false,
    isPaused: false,
    queue: [],
    pool: [], // Array of messages
    currentMessage: "", // Selected for current contact
    stats: { sent: 0, failed: 0, pending: 0, total: 0 },
    settings: { minDelay: 5, maxDelay: 15 },
    results: [],
    startTime: null,
    countdown: 0,
    name: "",
    tags: [],
    tags: [],
    consecutiveErrors: 0, // Safety Stop
    countdownTimer: null, // FIX: Track timer ID
};

let messageSafetyTimeout = null;
let isPageReadyForCurrentContact = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "START_CAMPAIGN":
            startCampaign(request.payload);
            sendResponse({ status: "started" });
            break;
        case "PAUSE_CAMPAIGN":
            pauseCampaign();
            sendResponse({ status: "paused" });
            break;
        case "RESUME_CAMPAIGN":
            resumeCampaign();
            sendResponse({ status: "resumed" });
            break;
        case "STOP_CAMPAIGN":
            stopCampaign();
            sendResponse({ status: "stopped" });
            break;
        case "GET_STATUS":
            sendResponse(campaignState);
            break;
        case "MSG_RESULT":
            // FIX: Detailed logging
            if (request.result.status === "failed") {
                console.warn(
                    `[NovaFlow] Fallo en ${request.result.phone}: ${request.result.reason}`
                );
            }
            handleMessageResult(request.result);
            sendResponse({ status: "ack" });
            break;
    }
    return true;
});

function startCampaign(payload) {
    if (campaignState.isRunning) return;

    // Support legacy "message" string vs new "pool" array
    let msgPool = payload.pool;
    if (!msgPool || msgPool.length === 0) msgPool = [payload.message];

    // Reset State
    campaignState = {
        isRunning: true,
        isPaused: false,
        queue: [...payload.contacts],
        pool: msgPool,
        message: "", // Will be set per contact
        stats: {
            sent: 0,
            failed: 0,
            pending: payload.contacts.length,
            total: payload.contacts.length,
        },
        settings: payload.settings,
        results: [],
        startTime: Date.now(),
        countdown: 0,
        name: payload.name || `Campaña ${new Date().toLocaleDateString()}`,
        tags: payload.tags || [],
        consecutiveErrors: 0,
        countdownTimer: null,
    };

    // FIX: Force cleanup on start
    clearSafetyTimeout();
    if (campaignState.countdownTimer)
        clearTimeout(campaignState.countdownTimer);

    console.log("[NovaFlow PRO] Campaña iniciada.", campaignState.name);
    broadcastStats();
    processNext();
}

function pauseCampaign() {
    if (campaignState.isRunning) {
        campaignState.isRunning = false;
        campaignState.isPaused = true;
        console.log("[NovaFlow] PAUSADA");
        broadcastStats();
        clearSafetyTimeout();
    }
}

function resumeCampaign() {
    if (campaignState.isPaused) {
        campaignState.isRunning = true;
        campaignState.isPaused = false;
        console.log("[NovaFlow] REANUDADA");
        broadcastStats();
        processNext();
    }
}

function stopCampaign() {
    console.log("[NovaFlow] PARADA");
    campaignState.isRunning = false;
    campaignState.isPaused = false;
    campaignState.queue = [];
    campaignState.countdown = 0;

    clearSafetyTimeout();
    finishCampaign(true);
    if (campaignState.countdownTimer)
        clearTimeout(campaignState.countdownTimer);
}

// Global Listener Reference (Prevent Ghosts)
let activeTabListener = null;

function clearActiveListener() {
    if (activeTabListener) {
        chrome.tabs.onUpdated.removeListener(activeTabListener);
        activeTabListener = null;
    }
}

function processNext() {
    // FIX: If stopped manually (!isRunning), don't finish again. Just exit.
    if (!campaignState.isRunning) return;

    if (campaignState.queue.length === 0) {
        if (!campaignState.isPaused) finishCampaign();
        return;
    }

    // Check Internet Connection
    if (!navigator.onLine) {
        console.warn("[NovaFlow] Sin conexión a Internet. Pausando...");
        pauseCampaign();
        chrome.runtime
            .sendMessage({ action: "INTERNET_DISCONNECTED" })
            .catch(() => {});
        return;
    }

    // Critical Error Check
    if (campaignState.consecutiveErrors >= 3) {
        console.error(
            "[NovaFlow] PARADA DE EMERGENCIA: Demasiados errores consecutivos."
        );
        // FIX: alert() is not supported in Service Workers. Use message.
        chrome.runtime
            .sendMessage({
                action: "SHOW_ALERT",
                title: "Parada de Emergencia",
                msg: "La campaña se detuvo por seguridad (3 errores seguidos).",
                icon: "🚨",
            })
            .catch(() => {});

        stopCampaign();
        return;
    }

    const nextContact = campaignState.queue[0];
    isPageReadyForCurrentContact = false;

    // FIX: Clear any existing countdown to prevent "Double Speed"
    if (campaignState.countdownTimer)
        clearTimeout(campaignState.countdownTimer);

    // Select Random Message from Pool
    const randomIndex = Math.floor(Math.random() * campaignState.pool.length);
    campaignState.currentMessage = campaignState.pool[randomIndex];

    // FIX: Calculate delay FIRST to ensure state is consistent
    const min = parseInt(campaignState.settings.minDelay);
    const max = parseInt(campaignState.settings.maxDelay);
    const delaySec = Math.floor(Math.random() * (max - min + 1) + min);
    campaignState.countdown = delaySec;

    console.log(
        `[NovaFlow] Navegando ${nextContact}. Msg ID: ${randomIndex}. Espera: ${delaySec}s`
    );

    // 1. Navigate Immediately (Pre-load)
    executeNavigation(nextContact).then(() => {
        runCountdown(nextContact);
    });
}

// Global Internet Listeners
self.addEventListener("offline", () => {
    if (campaignState.isRunning) {
        console.log("[NovaFlow] Detectada desconexión (Event). Pausando...");
        pauseCampaign();
        chrome.runtime
            .sendMessage({ action: "INTERNET_DISCONNECTED" })
            .catch(() => {});
    }
});

function runCountdown(contact) {
    if (!campaignState.isRunning) return;

    if (campaignState.countdown <= 0) {
        attemptSendWhenReady(contact);
        return;
    }

    chrome.runtime
        .sendMessage({
            action: "UPDATE_COUNTDOWN",
            seconds: campaignState.countdown,
        })
        .catch(() => {});

    campaignState.countdown--;
    // FIX: Save timer ID
    campaignState.countdownTimer = setTimeout(
        () => runCountdown(contact),
        1000
    );
}

async function attemptSendWhenReady(contact, attempt = 1) {
    if (!campaignState.isRunning) return;

    if (isPageReadyForCurrentContact) {
        const tabs = await chrome.tabs.query({
            url: "https://web.whatsapp.com/*",
        });
        if (tabs[0]) {
            // Final URL Validation before injecting
            // Final URL Validation before injecting
            // FIX: Removed strict URL check to prevent stalling.
            // Using basic presence check + previous listener cleanup.
            triggerSendAction(tabs[0].id, contact);
        }
    } else {
        console.log(
            `[NovaFlow] Esperando carga para ${contact} (Intento ${attempt})...`
        );
        if (attempt < 10) {
            setTimeout(() => attemptSendWhenReady(contact, attempt + 1), 1000);
        } else {
            // Force check if tab is actually ready but listener missed it
            const tabs = await chrome.tabs.query({
                url: "https://web.whatsapp.com/*",
            });
            if (tabs[0]) {
                triggerSendAction(tabs[0].id, contact);
            } else {
                handleMessageResult({
                    status: "failed",
                    phone: contact,
                    reason: "TIMEOUT_LOADING",
                });
            }
        }
    }
}

async function executeNavigation(contact) {
    try {
        const tabs = await chrome.tabs.query({
            url: "https://web.whatsapp.com/*",
        });
        if (tabs.length === 0) {
            console.error("WhatsApp Web no encontrado");
            campaignState.isRunning = false;
            return;
        }

        const tabId = tabs[0].id;
        const msgEncoded = encodeURIComponent(campaignState.currentMessage);
        const targetUrl = `https://web.whatsapp.com/send?phone=${contact}&text=${msgEncoded}`;

        await chrome.tabs.update(tabId, { url: targetUrl, active: true });

        setSafetyTimeout(contact);

        // FIX: Ensure no previous listener is active
        clearActiveListener();
        monitorTabLoad(tabId, contact);
    } catch (e) {
        console.error("Error navegación", e);
        handleMessageResult({
            status: "failed",
            phone: contact,
            error: e.message,
        });
    }
}

function monitorTabLoad(tabId, contact) {
    const listener = (tid, changeInfo, tab) => {
        // FIX: Verify URL contains contact to ensure it's not the PREVIOUS page
        if (tid === tabId && changeInfo.status === "complete") {
            // FIX: Removed strict URL check. Relying on unique listener per tab update.

            // FIX: Clean up ourselves immediately
            chrome.tabs.onUpdated.removeListener(listener);
            if (activeTabListener === listener) activeTabListener = null;

            isPageReadyForCurrentContact = true;

            if (campaignState.countdown <= 0 && campaignState.isRunning) {
                setTimeout(() => triggerSendAction(tabId, contact), 2500);
            }
        }
    };

    activeTabListener = listener;
    chrome.tabs.onUpdated.addListener(listener);
}

async function triggerSendAction(tabId, contact) {
    if (!campaignState.isRunning) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["assets/js/app.js"],
        });

        chrome.tabs.sendMessage(tabId, {
            action: "CLICK_SEND_BUTTON",
            phone: contact,
        });
    } catch (e) {
        if (
            e.message.includes("Frame with ID 0 was removed") ||
            e.message.includes("tab was closed")
        ) {
            return; // Ignore race condition
        }
        console.error("Script Injection Error", e);
        handleMessageResult({
            status: "failed",
            phone: contact,
            error: "Injection Failed",
        });
    }
}

function handleMessageResult(result) {
    clearSafetyTimeout();
    clearActiveListener(); // Ensure listener is gone on result too
    console.log("[NovaFlow] Resultado:", result);

    if (!campaignState.isRunning && !campaignState.isPaused) return;
    if (
        campaignState.queue.length > 0 &&
        campaignState.queue[0] !== result.phone
    )
        return;

    recordResultAndAdvance(result);
}

function setSafetyTimeout(contact) {
    clearSafetyTimeout();

    // FIX: Dynamic timeout based on user delay + buffer
    // Example: User sets 60s delay -> Timeout = 60s + 45s = 105s
    const maxDelay = parseInt(campaignState.settings?.maxDelay || 15) * 1000;
    const buffer = 45000;
    const timeoutDuration = maxDelay + buffer;

    console.log(
        `[NovaFlow] Safety Timeout set to ${
            timeoutDuration / 1000
        }s for ${contact}`
    );

    messageSafetyTimeout = setTimeout(() => {
        // WARN: Esto cuenta como error consecutivo? Si.
        handleMessageResult({
            status: "failed",
            phone: contact,
            reason: "TIMEOUT_SAFETY_GENERIC",
        });
    }, timeoutDuration);
}

function clearSafetyTimeout() {
    if (messageSafetyTimeout) {
        clearTimeout(messageSafetyTimeout);
        messageSafetyTimeout = null;
    }
}

function recordResultAndAdvance(result) {
    campaignState.results.push({
        phone: result.phone,
        status: result.status,
        error: result.reason || null,
        msg_used: campaignState.currentMessage, // Validar qué mensaje se usó
        time: new Date().toLocaleTimeString(),
    });

    // Logic: Consecutive Errors
    if (result.status === "failed" && result.reason !== "INVALID_NUMBER") {
        // Invalid number doesn't count as system crash
        campaignState.consecutiveErrors++;
    } else {
        campaignState.consecutiveErrors = 0;
    }

    if (campaignState.queue.length > 0) {
        campaignState.queue.shift();

        if (result.status === "ok") campaignState.stats.sent++;
        else campaignState.stats.failed++;

        campaignState.stats.pending = campaignState.queue.length;

        broadcastStats();
        if (campaignState.isRunning) {
            // FIX: Add delay before next navigation to prevent timeout errors and ensure safe message sending
            setTimeout(() => processNext(), 3000);
        }
    }
}

function broadcastStats() {
    chrome.runtime
        .sendMessage({
            action: "UPDATE_STATS",
            stats: campaignState.stats,
            isRunning: campaignState.isRunning,
            isPaused: campaignState.isPaused,
        })
        .catch(() => {});
}

async function finishCampaign(wasStopped = false) {
    console.log("[NovaFlow] Fin de campaña");
    campaignState.isRunning = false;
    campaignState.isPaused = false;
    campaignState.countdown = 0;
    clearSafetyTimeout();

    broadcastStats();

    const historyItem = {
        id: campaignState.startTime,
        date: new Date(campaignState.startTime).toLocaleString(),
        name: campaignState.name, // NEW
        pool: campaignState.pool, // NEW
        tags: campaignState.tags, // NEW
        message: campaignState.pool[0], // Compatibilidad visual simple
        total: campaignState.stats.total,
        sent: campaignState.stats.sent,
        failed: campaignState.stats.failed,
        details: campaignState.results,
        status: wasStopped ? "Stopped" : "Completed",
    };

    const data = await chrome.storage.local.get("history");
    const history = data.history || [];
    history.unshift(historyItem);

    // Limit history to last 100 items (User warning handled)
    if (history.length > 100) history.pop();

    await chrome.storage.local.set({ history });

    chrome.runtime
        .sendMessage({
            action: "CAMPAIGN_FINISHED",
            id: historyItem.id,
            wasStopped: wasStopped,
        })
        .catch(() => {});
}
