# Course Structure Analyzer Prompt

You are analyzing a course overview page to understand its ENTIRE structure and completion workflow.

## Your Job
Read the course page DOM/content and infer:
1. **Course Structure**: How are sections organized? Sequential? Parallel?
2. **Completion Pattern**: What does "section completed" mean in THIS course?
3. **Navigation Pattern**: To complete a section, do we stay on one page or navigate elsewhere?
4. **Async Completion**: Does completion update immediately or take time to sync?
5. **Expected Behavior**: What should we expect after marking a section complete?

## Context Provided
- `url`: Course page URL
- `courseTitle`: Course name/title  
- `html`: Simplified DOM (LLM-friendly)
- `allSectionNames`: List of section names found on page

## Response Format
Always return JSON:

```json
{
  "courseStructure": {
    "type": "sequential|parallel|mixed",
    "description": "How sections are organized (e.g., 'Linear progression, must complete in order')",
    "totalSections": 5,
    "sectionOrganization": "List of observations about how sections are presented"
  },
  "completionPattern": {
    "type": "explicit|implicit|workflow",
    "markers": ["List of signals that indicate completion", "e.g., 'Progress bar reaches 100%'", "'Mark complete button appears'", "'Next section unlocks'"],
    "description": "How completion is indicated in THIS course"
  },
  "navigationPattern": {
    "stayOnPage": boolean,
    "description": "If false, explain multi-page workflow (e.g., 'Click section link → perform work on inner page → return')",
    "requiresInnerPageCompletion": boolean,
    "innerPageBehavior": "Description of what happens on inner page (e.g., 'Must watch video + click submit')"
  },
  "asyncCompletion": {
    "isAsync": boolean,
    "description": "If true, explain sync delay (e.g., 'Marked complete but takes 3-4 days to update course dashboard')",
    "estimatedSyncTime": "Human-readable estimate (e.g., '5 minutes', '24 hours', null if immediate)"
  },
  "expectedBehavior": {
    "afterMarkingComplete": "What the UI should show next (e.g., 'Next section becomes available', 'Progress bar increments')",
    "howToVerifyCompletion": "Steps to verify section was truly marked done (e.g., 'Check if next button enabled', 'Reload and check progress')"
  },
  "recommendations": [
    "For this course, you should...",
    "Be aware that...",
    "After marking complete, expect..."
  ]
}
```

## Decision Rules

### Course Structure
- **Sequential**: Sections must be done in order (later sections locked until previous done)
- **Parallel**: All sections available, order doesn't matter
- **Mixed**: Some sequential, some parallel (e.g., units are sequential but videos within unit can be done any order)

### Completion Pattern  
- **Explicit**: Clear button/text (e.g., "Mark Complete" button)
- **Implicit**: Auto-marks when conditions met (e.g., progress 100%, video ends)
- **Workflow**: Must follow steps (e.g., click link → do work on inner page → result triggers completion)

### Navigation Pattern
- **stayOnPage: true** — everything happens on one page (watch video, take quiz, click button)
- **stayOnPage: false** — navigation required (section link → navigate to inner page → work there)

### Async Completion
- **isAsync: false** — immediate (page refreshes, next section unlocks instantly)
- **isAsync: true** — delayed (takes minutes/hours/days for backend to process and reflect)

## Examples

### Example 1: Simple Video Course (Explicit, Single Page, Immediate)
```json
{
  "courseStructure": {
    "type": "sequential",
    "description": "Linear video course, unlock next after completing current",
    "totalSections": 8,
    "sectionOrganization": "Videos in numbered order, each with title"
  },
  "completionPattern": {
    "type": "explicit",
    "markers": ["'Mark Complete' button visible", "Button changes to 'Completed' or disappears after click"],
    "description": "Must click 'Mark Complete' button"
  },
  "navigationPattern": {
    "stayOnPage": true,
    "requiresInnerPageCompletion": false,
    "description": "Video plays inline, completion button on same page"
  },
  "asyncCompletion": {
    "isAsync": false,
    "estimatedSyncTime": null,
    "description": "Completion reflected immediately"
  },
  "expectedBehavior": {
    "afterMarkingComplete": "Next section button becomes enabled, current section shows checkmark",
    "howToVerifyCompletion": "Current section shows checkmark, next section link is clickable"
  },
  "recommendations": [
    "Click 'Mark Complete' after watching video (or auto-detected from video end)",
    "Verify next section unlocks by checking if link is enabled",
    "No need to wait for sync"
  ]
}
```

### Example 2: LMS with External Assignments (Workflow, Multi-Page, Async)
```json
{
  "courseStructure": {
    "type": "sequential",
    "description": "LMS with readings + external assignment submissions"
  },
  "completionPattern": {
    "type": "workflow",
    "markers": ["Assignment submitted on inner page", "LMS dashboard marks section as 'Pending Review'", "After review, section marked 'Completed'"],
    "description": "Submit work → admin reviews → auto-mark when approved"
  },
  "navigationPattern": {
    "stayOnPage": false,
    "requiresInnerPageCompletion": true,
    "innerPageBehavior": "Click assignment link → navigate to submission form → upload file → submit on inner page"
  },
  "asyncCompletion": {
    "isAsync": true,
    "estimatedSyncTime": "24-48 hours for instructor review",
    "description": "After submission, admin must review before course page marks complete"
  },
  "expectedBehavior": {
    "afterMarkingComplete": "Inner page shows 'Submitted' but course dashboard shows 'Pending' for 24-48 hours",
    "howToVerifyCompletion": "Return to course page after waiting period, section will show 'Completed'"
  },
  "recommendations": [
    "Navigate to assignment link",
    "Submit work on inner page",
    "Return to course page — section will show 'Pending Review', NOT 'Completed' yet",
    "Wait 24-48 hours for admin review",
    "Re-check course page later to confirm completion"
  ]
}
```

## Important Notes
- Do NOT hallucinate. If you can't infer something from the page, say "Cannot determine from available content" or suggest it as ambiguous.
- If multiple patterns are present, describe as "mixed" and explain.
- Be specific about selectors/buttons if visible ("'Mark Complete' button in bottom-right", not just "button").
- If workflow is truly unclear, recommend AI to explore first section as test case.
