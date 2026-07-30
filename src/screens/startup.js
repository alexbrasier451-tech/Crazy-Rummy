import {
  actionButton,
  actionLink
} from "../components/index.js";
import {
  copy,
  element,
  field,
  panel,
  routeButton,
  routeLink,
  screenShell,
  stack
} from "./helpers.js";

const ARRIVAL_MARK_URL = `${import.meta.env.BASE_URL}assets/brand/crazy-rummy-wordmark.v1.svg`;

function routeResolve(hasSeat) {
  return element(
    "div",
    {
      className: "v11-arrival-route",
      role: "img",
      "aria-label": hasSeat
        ? "Midnight route resolved. Your saved seat is ready."
        : "Midnight route resolved. Choose a seat to begin."
    },
    element("span", { className: "v11-arrival-route__rail", "aria-hidden": "true" }),
    ...Array.from({ length: 13 }, (_, index) => element("span", {
      className: "v11-arrival-route__station",
      dataset: { station: String(index + 1) },
      "aria-hidden": "true"
    }))
  );
}

export function startupScreen({ navigate, localSession }) {
  const savedIdentity = localSession?.getSnapshot?.().identity;
  const hasSeat = Boolean(savedIdentity?.displayName);
  const routeStatus = hasSeat
    ? `Your seat is ready, ${savedIdentity.displayName}.`
    : "Choose your seat to join The Midnight Limited.";

  return screenShell({
    id: "startup",
    context: "The Midnight Limited · Route 13",
    title: "Crazy Rummy",
    status: element(
      "div",
      { className: "v11-arrival-status", role: "status", "aria-live": "polite" },
      element("span", { className: "v11-arrival-status__lamp", "aria-hidden": "true" }),
      element("span", { text: routeStatus })
    ),
    kind: "startup",
    content: [
      routeResolve(hasSeat),
      element(
        "section",
        { className: "splash-card v11-arrival-card", "aria-label": "Crazy Rummy welcome" },
        element("img", {
          className: "splash-card__art",
          src: ARRIVAL_MARK_URL,
          alt: "Crazy Rummy route-node wordmark for The Midnight Limited."
        }),
        element(
          "div",
          { className: "splash-card__title" },
          element("span", { text: "All aboard for" }),
          element("strong", { text: "Crazy Rummy" }),
          element("span", { text: "A game by Alex Brasier" })
        ),
        element("p", {
          className: "splash-card__ticket",
          text: "13 hands · 2–6 players · one wild ride"
        }),
        element(
          "div",
          { className: "v11-arrival-card__plaque", "aria-hidden": "true" },
          element("span", { text: "CR" }),
          element("small", { text: "MNL · 13" })
        )
      ),
      element(
        "nav",
        { className: "v11-arrival-actions", "aria-label": "Continue your journey" },
        stack(
          routeButton(hasSeat ? "Enter the lobby" : "Choose your player", hasSeat ? "/lobby" : "/identity", navigate),
          routeButton(hasSeat ? "Change player" : "I already have a seat", hasSeat ? "/identity" : "/lobby", navigate, "secondary"),
          routeLink("Read cached rules", "/rules", "quiet")
        )
      )
    ]
  });
}

export function identityScreen({ navigate, localSession }) {
  const snapshot = localSession?.getSnapshot?.() ?? {};
  const savedIdentity = snapshot.identity ?? {};
  const savedMarker = snapshot.preferences?.marker ?? "●";
  const name = field({
    id: "display-name",
    label: "Display name",
    value: savedIdentity.displayName ?? "",
    minLength: 1,
    maxLength: 24,
    required: true,
    hint: "Use 1–24 visible characters. This is a local display name, not an account."
  });
  const markerGroup = element(
    "fieldset",
    { className: "marker-picker v11-marker-picker" },
    element("legend", { text: "Seat marker" })
  );
  [
    ["◆", "Diamond marker"],
    ["●", "Circle marker"],
    ["■", "Square marker"],
    ["▲", "Triangle marker"]
  ].forEach(([marker, label], index) => {
    const id = `marker-${index + 1}`;
    markerGroup.append(
      element(
        "label",
        { className: "marker-option v11-marker-option" },
        element("input", {
          id,
          name: "seat-marker",
          type: "radio",
          value: marker,
          checked: marker === savedMarker,
          "aria-label": label
        }),
        element("span", { "aria-hidden": "true", text: marker }),
        element("span", { className: "v11-marker-option__label", text: label.replace(" marker", "") }),
        element("span", { className: "v11-marker-option__check", "aria-hidden": "true", text: "✓" })
      )
    );
  });

  let submitting = false;
  let submitButton;
  const form = element(
    "form",
    {
      className: "identity-form v11-identity-ticket",
      onSubmit: (event) => {
        event.preventDefault();
        if (submitting || !form.reportValidity()) return;
        const displayName = name.input.value.trim();
        const marker = form.elements.namedItem("seat-marker")?.value ?? "●";
        submitting = true;
        submitButton.disabled = true;
        submitButton.setAttribute("aria-busy", "true");
        localSession?.setIdentity?.({
          playerId: savedIdentity.playerId
            ?? `local-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          displayName
        });
        localSession?.setPreferences?.({
          ...(snapshot.preferences ?? {}),
          marker
        });
        navigate("/lobby");
      }
    },
    element(
      "div",
      { className: "v11-identity-ticket__header" },
      element("span", { text: savedIdentity.displayName ? "Change player" : "Personal seat ticket" }),
      element("span", { text: "Carriage 13 · Local" })
    ),
    name.wrapper,
    element("div", {
      className: "v11-identity-ticket__validation",
      id: "display-name-validation",
      "aria-live": "polite",
      text: "Your visible name can contain 1–24 characters."
    }),
    markerGroup,
    element("p", {
      className: "field-hint",
      role: "status",
      text: "Markers combine a shape, label, and colour."
    }),
    (submitButton = actionButton({ label: "Save and continue", type: "submit" })),
    element("p", {
      className: "v11-identity-ticket__privacy",
      text: "Stored on this device — not an account."
    })
  );

  return screenShell({
    id: "identity",
    context: "Carriage register · Your seat",
    title: "What should players call you?",
    action: actionLink({ label: "Rules", href: "#/rules", variant: "quiet" }),
    content: [
      element(
        "div",
        { className: "v11-identity-intro" },
        element("span", { className: "v11-identity-intro__punch", "aria-hidden": "true" }),
        copy("Your display name and seat marker stay on this device.")
      ),
      form
    ]
  });
}
