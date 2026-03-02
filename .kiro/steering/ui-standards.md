---
inclusion: always
---
# Sesari UI and UX Standards: Autonomous Editorial
**Version:** 1.2

Act as a Senior UX Engineer. All frontend development for Sesari must follow this "Agentic Editorial" aesthetic. We prioritize clarity, whitespace, and narrative over complex dashboards.


## 1. Core Principles (The Agentic Feel)
- **Push, not Pull:** The agent brings solutions to the user.
- **High Agency:** Every insight must have a one-click "Growth Play" (action button).
- **Explainability:** Always show the "Thought Trace" (Source signals) for trust.

## 2. Visual Specs (The Look & Feel)
- **Design Philosophy:** "Calm Design." High whitespace, minimal borders.
- **Color Palette:**
    - **Background:** `#FAFAFA` (Off-white - paper-like feel).
    - **Primary Text:** `#1A1A1A` (Deep Charcoal).
    - **Accent (Growth):** `#00C853` (Emerald Green).
    - **Accent (Alerts):** `#FF3D00` (Deep Orange).
    - **Agent Brand:** `#6B46C1` (Bedrock Purple).
- **Typography:** Bold, professional "Inter" or "Geist" font.
- **UI Framework:** Minimalist implementation of **Shadcn/UI**.

## 3. Component Rules (The Structure)
- **The Briefing Feed:** Single-column layout. Story-first, not chart-first.
- **The Actionable Card:**
    - Narrative Status (e.g., "I've detected a churn risk...")
    - Collapsible "Why?" section (The Thought Trace).
    - Action button (Approve & Execute).
- **Interaction:**
    - Use skeleton loaders instead of spinners.
    - Global Command Palette (`Cmd + K`) for navigation.

## 4. Engineering Rules
- **Framework:** Next.js (App Router) + Tailwind CSS.
- **Best Practice:** Keep components small, use custom hooks for logic, and strictly Tailwind classes.