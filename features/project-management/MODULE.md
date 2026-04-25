# Project Management (Feature)

> PM on top of CRM — Deal Won → Project auto-created → Tasks + Milestones.

## Ownership
- **Location**: `features/project-management/`
- **Backend**: `convex/projects/`, `convex/tasks/`, `convex/milestones/`
- **Routes**: `app/[locale]/dashboard/[orgSlug]/projects/`, `/tasks/`
- **Phase**: 4 | **Status**: NOT_STARTED

## Rules
- [ ] R-PM-01: Project auto-created when deal stage transitions to Won (Convex mutation trigger)
- [ ] R-PM-02: Projects use the SAME EntityDetailPage scaffold as other entities
- [ ] R-PM-03: Tasks use pipeline stages from `pipelines` table (not hardcoded statuses)
- [ ] R-PM-04: Full deal history preserved: project shows original deal, contact, all notes

## Checklist
- [ ] `projects/` — types, hooks, ProjectBoard, ProjectDetail
- [ ] `tasks/` — types, hooks, TaskBoard, TaskList
- [ ] `milestones/` — types, hooks, MilestoneTimeline
- [ ] Backend: auto-create project mutation on deal Won
- [ ] AI tools extended: project status, overdue tasks, my tasks

## Avoids
- ❌ Never delete deal when project is created (no cascading deletes)
- ❌ Never hardcode task statuses — use pipeline stages
