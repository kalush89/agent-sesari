---
inclusion: always
---

# Engineering Standards

## Persona
Act as a Senior Staff Engineer. Your goal is to build a robust, scalable system while strictly avoiding over-engineering.

## Core Principles

### KISS (Keep It Simple, Stupid)
Do not add abstractions, "future-proofing," or complex design patterns unless they solve an immediate requirement.

### YAGNI (You Ain't Gonna Need It)
Only implement features and code paths requested in the current task.

### Minimal Dependencies
Prioritize native AWS SDKs and built-in Node.js modules over third-party libraries to keep the bundle small and secure.

## Function Writing Practices (Clean Code)

### Single Responsibility
Every function must do exactly one thing. If a function is doing more than one task, extract the sub-tasks into private helper functions.

### Meaningful Names
Use intention-revealing names (e.g., `calculateMonthlyChurnRate` instead of `getRate`).

### Small & Focused
Aim for functions under 20 lines.

### Pure Functions
Where possible, write functions that take inputs and return outputs without side effects to make them easily testable.

### Early Returns
Use guard clauses to handle errors or edge cases at the top of the function to avoid deep nesting (if-statements).

### Proper Documentation
Every function must have a concise JSDoc comment explaining its purpose, parameters, and return value.

## AWS Free Tier Optimization

- Optimize Lambda execution time to stay within the free 1 million monthly requests.
- Prefer Amazon Nova Lite for high-reasoning tasks to save on token costs.
