/* Accessible dialogs shared by the storefront and arcade. */
document.addEventListener("DOMContentLoaded", () => {
  const dialogs = [...document.querySelectorAll(".modal,.modal-backdrop")];
  let previousFocus = null;
  const open = () => dialogs.filter((d) => !d.classList.contains("hidden"));
  dialogs.forEach((dialog) => {
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const title = dialog.querySelector("h3,h2");
    if (title) {
      title.id ||= dialog.id + "-title";
      dialog.setAttribute("aria-labelledby", title.id);
    }
    dialog.tabIndex = -1;
    new MutationObserver((records) => {
      const wasHidden = records.some((r) =>
        r.oldValue?.split(" ").includes("hidden"),
      );
      const active = open();
      document.body.classList.toggle("dialog-open", active.length > 0);
      if (!dialog.classList.contains("hidden") && wasHidden) {
        previousFocus = document.activeElement;
        const focus = dialog.querySelector(
          "button:not([disabled]),a[href],input",
        );
        (focus || dialog).focus();
      } else if (!active.length && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    }).observe(dialog, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
    });
  });
  document.addEventListener("keydown", (e) => {
    const active = open().at(-1);
    if (!active) return;
    if (e.key === "Escape") {
      active.classList.add("hidden");
      return;
    }
    if (e.key !== "Tab") return;
    const controls = [
      ...active.querySelectorAll(
        'button:not([disabled]),a[href],input,select,[tabindex="0"]',
      ),
    ].filter((x) => x.getClientRects().length);
    if (!controls.length) {
      e.preventDefault();
      active.focus();
      return;
    }
    const first = controls[0],
      last = controls.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        !active.contains(document.activeElement))
    ) {
      e.preventDefault();
      last.focus();
    } else if (
      !e.shiftKey &&
      (document.activeElement === last ||
        !active.contains(document.activeElement))
    ) {
      e.preventDefault();
      first.focus();
    }
  });
});
