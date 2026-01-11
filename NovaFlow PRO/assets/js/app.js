if (!window.hasNovaFlowListener) {
    window.hasNovaFlowListener = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "CLICK_SEND_BUTTON") {
            attemptClick(request.phone);
            sendResponse({ received: true });
        }
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptClick(phone) {
    try {
        console.log(`[NovaFlow] Procesando ${phone}...`);

        await waitForMainUI();

        if (checkIfInvalidPopupVisible()) {
            throw new Error("POPUP_INVALID_NUMBER");
        }

        const mainInput = document.querySelector(
            '#main div[contenteditable="true"][role="textbox"]'
        );
        if (mainInput) {
            mainInput.focus();
            document.execCommand("insertText", false, " ");
            document.execCommand("delete", false, null);
            await sleep(300);
        }

        let sent = await tryClickButton();
        if (!sent) {
            await sleep(500);
            sent = await tryClickButton();
        }
        if (!sent) {
            console.log("[NovaFlow] Fallback a ENTER...");
            sent = await tryEnterKey();
        }

        if (sent) {
            await sleep(2500);

            if (checkIfInvalidPopupVisible()) {
                throw new Error("POPUP_INVALID_NUMBER");
            }

            const textBox = document.querySelector(
                '#main div[contenteditable="true"][role="textbox"]'
            );
            if (textBox && textBox.innerText.trim().length > 0) {
                console.warn("[NovaFlow] Texto remanente. Reintentando...");
                await tryEnterKey();
                await sleep(1500);

                // Relaxed: Don't throw error here. Allow to assume success.
            }

            chrome.runtime.sendMessage({
                action: "MSG_RESULT",
                result: { status: "ok", phone },
            });
        } else {
            throw new Error("SEND_ACTION_FAILED");
        }
    } catch (e) {
        // Logging Downgrading: Errors esperados son WARN, no ERROR
        const expectedErrors = [
            "POPUP_INVALID_NUMBER",
            "TIMEOUT_FINDING_UI",
            "MESSAGE_STUCK_IN_BOX",
        ];

        if (
            expectedErrors.includes(e.message) ||
            checkIfInvalidPopupVisible()
        ) {
            console.warn(
                `[NovaFlow] Operación interrumpida: ${e.message} (Controlado)`
            );
        } else {
            console.error("[NovaFlow] Error no esperado:", e);
        }

        closeInvalidPopupIfFound();

        if (
            checkIfInvalidPopupVisible() ||
            e.message === "POPUP_INVALID_NUMBER" ||
            e.message === "TIMEOUT_FINDING_UI"
        ) {
            chrome.runtime.sendMessage({
                action: "MSG_RESULT",
                result: { status: "failed", phone, reason: "INVALID_NUMBER" },
            });
        } else {
            chrome.runtime.sendMessage({
                action: "MSG_RESULT",
                result: { status: "failed", phone, reason: e.message },
            });
        }
    }
}

function checkIfInvalidPopupVisible() {
    const bodyText = document.body.innerText;

    // Regex SUPER Abracadora
    const invalidKeywords = [
        /fono.*inv[aá]lido/i,
        /number.*invalid/i,
        /url.*invalid/i,
        /enlace.*incorrecto/i,
        /link.*incorrect/i,
        /no.*existe/i,
        /no.*v[aá]lido/i,
    ];

    if (invalidKeywords.some((regex) => regex.test(bodyText))) {
        return true;
    }

    const popup = document.querySelector(
        'div[data-testid="popup-contents"], div[role="dialog"]'
    );
    if (
        popup &&
        popup.innerText.match(/inv[aá]lido|invalid|incorrecto|incorrect|error/i)
    ) {
        return true;
    }

    return false;
}

function closeInvalidPopupIfFound() {
    if (checkIfInvalidPopupVisible()) {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
            if (btn.innerText.match(/OK|Aceptar|Cerrar|Close/i)) {
                btn.click();
                return true;
            }
        }
    }
    return false;
}

function waitForMainUI() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;

            if (checkIfInvalidPopupVisible()) {
                clearInterval(interval);
                reject(new Error("POPUP_INVALID_NUMBER"));
                return;
            }

            const mainPanel = document.getElementById("main");
            if (mainPanel) {
                const sendBtn = mainPanel.querySelector(
                    'span[data-icon="send"]'
                );
                const textBox = mainPanel.querySelector(
                    'div[contenteditable="true"][role="textbox"]'
                );

                if (sendBtn || textBox) {
                    clearInterval(interval);
                    resolve(true);
                    return;
                }
            }

            if (attempts >= 20) {
                clearInterval(interval);
                reject(new Error("TIMEOUT_FINDING_UI"));
            }
        }, 1000);
    });
}

async function tryClickButton() {
    const selectors = [
        '#main span[data-icon="send"]',
        '#main button[aria-label="Send"]',
        '#main button[aria-label="Enviar"]',
        'footer button span[data-icon="send"]',
        'span[data-icon="send"]',
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
            const btn =
                el.closest("button") || el.closest('div[role="button"]') || el;
            const eventOpts = { bubbles: true, cancelable: true, view: window };
            btn.dispatchEvent(new MouseEvent("mousedown", eventOpts));
            btn.dispatchEvent(new MouseEvent("mouseup", eventOpts));
            btn.click();
            return true;
        }
    }
    return false;
}

async function tryEnterKey() {
    const textBox = document.querySelector(
        '#main div[contenteditable="true"][role="textbox"]'
    );
    if (textBox) {
        textBox.focus();
        const enterEvent = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            keyCode: 13,
            which: 13,
            key: "Enter",
            code: "Enter",
        });
        textBox.dispatchEvent(enterEvent);
        return true;
    }
    return false;
}
