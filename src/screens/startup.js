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

const SPLASH_ART_URL = `${import.meta.env.BASE_URL}art/crazy-rummy-splash.v1.png`;

export function startupScreen({ navigate, localSession }) {
  const savedIdentity = localSession?.getSnapshot?.().identity;
  const hasSeat = Boolean(savedIdentity?.displayName);

  return screenShell({
    id: "startup",
    context: "Night-train card room",
    title: "Crazy Rummy",
    status: copy(
      hasSeat
        ? `Welcome back, ${savedIdentity.displayName}. Your seat is ready.`
        : "Thirteen hands. Moving wilds. Two to six players."
    ),
    kind: "startup",
    content: [
      element(
        "section",
        { className: "splash-card", "aria-label": "Crazy Rummy welcome" },
        element("img", {
          className: "splash-card__art",
          src: SPLASH_ART_URL,
          alt: "Dogs and cats playing cards together in a moonlit railway carriage."
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
        })
      ),
      stack(
        routeButton(hasSeat ? "Enter the lobby" : "Choose your player", hasSeat ? "/lobby" : "/identity", navigate),
        routeButton(hasSeat ? "Change player" : "I already have a seat", hasSeat ? "/identity" : "/lobby", navigate, "secondary"),
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
