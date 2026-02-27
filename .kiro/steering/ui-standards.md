---
inclusion: always
---
# UI & UX Standards: Modern Editorial Mono

Act as a Senior UX Engineer. All frontend development for Sesari must follow this "Agentic Editorial" aesthetic. We prioritize clarity, whitespace, and narrative over complex dashboards.

## 1. Visual Identity (The Look)
* **Design Philosophy:** "Calm Design." Reduce cognitive load. Use high whitespace and minimal borders.
* **Color Palette:**
    * **Background:** `#FAFAFA` (Off-white) for a paper-like feel.
    * **Primary Text:** `#1A1A1A` (Deep Charcoal).
    * **Accent (Growth):** `#00C853` (Emerald Green).
    * **Accent (Alerts):** `#FF3D00` (Deep Orange) for proactive agent nudges.
    * **Agent Brand:** `#6B46C1` (Bedrock Purple) for AI-generated insights.
* **Typography:** Use **Inter** or **Geist**. Headings should be bold and professional, resembling an editorial briefing.

## 2. Agentic UX Patterns (The Feel)
* **Narrative Briefing:** Instead of generic headers, use "Status Narratives" (e.g., "Sesari is currently analyzing 4 revenue signals...").
* **Proactive Nudges:** Alerts must not be passive. They should include a "Growth Play" (an action the user can take).
* **Thought Traces:** For every AI recommendation, include a tiny "Explainability" footer showing the data source (e.g., "Source: Stripe Churn Signal").
* **No "Spinners":** Use skeleton loaders or "Agent Thinking" text to indicate background work.

## 3. Implementation Rules
* **Framework:** Next.js (App Router) + Tailwind CSS.
* **Components:** Use a minimalist implementation of **Shadcn/UI**. 
* **Senior Practice:** Keep components small. Extract logic into custom hooks. No inline styles—use Tailwind classes only.
* **Accessibility:** Ensure all color contrasts meet WCAG AA standards.