import {
  actionButton,
  actionLink,
  connectionState
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

export function startupScreen({ navigate, localSession }) {
  const savedIdentity = localSession?.getSnapshot?.().identity;
  const offlineState = connectionState({
    state: "offline",
    label: "Offline example",
    detail:
      "You’re offline. Rules and your last received table are available; online play will resume when you reconnect."
  });

  return screenShell({
    id: "startup",
    context: "Crazy Rummy",
    title: "Taking your seat…",
    status: copy(
      savedIdentity?.displayName
        ? `Local seat ready for ${savedIdentity.displayName}.`
        : "Choose a local display name to continue."
    ),
    kind: "startup",
    content: [
      element(
        "div",
        { className: "brand-lockup", "aria-label": "Crazy Rummy, thirteen stops" },
        element("span", { className: "brand-mark", "aria-hidden": "true", text: "◆ ━ ◇" }),
        element("strong", { text: "Crazy Rummy" }),
        element("span", { text: "13 stops" })
      ),
      offlineState,
      stack(
        routeButton("First launch: choose your seat", "/identity", navigate),
        routeButton("Returning player: open Lobby", "/lobby", navigate, "secondary"),
        routeLink("Read cached rules", "/rules", "quiet")
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
    { className: "marker-picker" },
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
        { className: "marker-option" },
        element("input", {
          id,
          name: "seat-marker",
          type: "radio",
          value: marker,
          checked: marker === savedMarker
        }),
        element("span", { "aria-hidden": "true", text: marker }),
        element("span", { className: "sr-only", text: label })
      )
    );
  });

  const form = element(
    "form",
    {
      className: "identity-form",
      onSubmit: (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const displayName = name.input.value.trim();
        const marker = form.elements.namedItem("seat-marker")?.value ?? "●";
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
    name.wrapper,
    markerGroup,
    element("p", {
      className: "field-hint",
      role: "status",
      text: "Markers combine a shape, label, and colour."
    }),
    actionButton({ label: "Save and continue", type: "submit" })
  );

  return screenShell({
    id: "identity",
    context: "Your seat",
    title: "What should players call you?",
    action: actionLink({ label: "Rules", href: "#/rules", variant: "quiet" }),
    content: [
      copy("Your display name and seat marker stay on this device."),
      form
    ]
  });
}
