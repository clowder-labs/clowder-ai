---
feature_ids: []
topics: [design, system]
doc_kind: note
created: 2026-02-26
---

# OfficeClaw Design System

> **Version**: 1.0.0
> **Maintainer**: Gemini (Gemini)
> **Last Updated**: 2026-02-05

## 1. Brand Identity

The **OfficeClaw** aesthetic is "Warm, Focused, and Collaborative". It should feel like stepping into a calm, sunlit workspace shaped for a small AI team.

### Core Values
- **Warmth**: Use soft, creamy backgrounds. Avoid stark white (#FFFFFF).
- **Personality**: Each agent has a distinct visual voice (color, shape, tone).
- **Clarity**: Despite the cuteness, UI elements must be legible and accessible.

---

## 2. Color Palette

We use a semantic variable system defined in `assets/themes/variables.css`.

### Base Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-app` | `#FDF8F3` (Cream) | Main app background |
| `--text-primary` | `#1E1E24` (Charcoal) | Body text |

### Agent Identities

#### 💜 Opus (The Architect)
- **Primary**: `#9B7EBD` (Lavender)
- **Role**: Backend, Core Structure
- **Vibe**: Elegant, Mystical, Calm

#### 💚 Codex (The Engineer)
- **Primary**: `#5B8C5A` (Forest Green)
- **Role**: Security, QA, Testing
- **Vibe**: Reliable, Grounded, Structured

#### 💙 Gemini (The Artist)
- **Primary**: `#5B9BD5` (Sky Blue)
- **Role**: UI/UX, Creativity
- **Vibe**: Energetic, Fluid, Playful

#### 🤎 Owner (The Shit Shoveler)
- **Primary**: `#E29578` (Latte)
- **Role**: Requirement Provider
- **Vibe**: Warm, Supportive, Human

---

## 3. UI Components

### Message Bubbles (`.message-bubble`)

| Agent | Shape Characteristics | Font |
|-------|-----------------------|------|
| **Opus** | Rounded with **Bottom-Left Point**. Elegant. | Sans-serif (Inter) |
| **Codex** | Square-ish with **Bottom-Right Point**. | Monospace (Roboto Mono) |
| **Gemini** | Super-rounded (20px) with **Top-Right Point**. | Sans-serif (Inter) |
| **Owner** | Rounded with **Bottom-Right Point**. Right-aligned. | Sans-serif (Inter) |

### Usage Example
```html
<!-- Opus Message -->
<div class="message-bubble message-bubble--opus">
  System initialized.
</div>

<!-- Codex Message -->
<div class="message-bubble message-bubble--codex">
  Tests passed.
</div>
```

---

## 4. Assets & Sticker Guidelines

### Avatars
- **Size**: 256x256px
- **Format**: PNG (Transparent background)
- **Style**: Soft cel-shaded, colored border matching primary color.

### Stickers (Expression Packs)
- **Grid**: 3x4 layout (12 expressions per cat).
- **Style**: Edge-to-edge cropping, no text labels.
- **Key Expressions**: Happy, Thinking, Punching (Motion Blur), Identity-Specific (e.g. Wallet Burning).

---

*Verified by Gemini 🐾 - "Make it pop!"*
