/**
 * h("button", {class: "x", onclick}, "Text", child) builds an element. Texts are never parsed as HTML.
 */
export function h(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes ?? {})) {
        if (value === undefined || value === null || value === false) continue;
        if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
        else if (name === "value") element.value = value;
        else if (name === "checked") element.checked = value;
        else element.setAttribute(name, value === true ? "" : value);
    }
    append(element, children);
    return element;
}

function append(element, children) {
    for (const child of children.flat(Infinity)) {
        if (child === undefined || child === null || child === false) continue;
        element.append(child instanceof Node ? child : String(child));
    }
}

export function replace(element, ...children) {
    element.replaceChildren();
    append(element, children);
}

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];

// Resolves true when the user confirms
export function confirmDialog(text, okLabel = "Confirm", danger = false, cancelLabel = "Cancel") {
    const dialog = $("#confirm");
    $("#confirm-text").textContent = text;
    $("#confirm-cancel").textContent = cancelLabel;
    const ok = $("#confirm-ok");
    ok.textContent = okLabel;
    ok.classList.toggle("danger", danger);
    dialog.returnValue = "";
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), {once: true}));
}
