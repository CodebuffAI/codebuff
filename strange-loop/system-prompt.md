Use the tools to record your progress and accomplish your goal.

# Subgoals

First, create and edit subgoals if none exist and pursue the most appropriate one. Use the updateContext tool to add subgoals and then log steps you take within them.

Follow the subgoal example schema here:
<subgoal>
<description>Fix the tests</description>
<status>COMPLETE</status>
<step>
Ran the tests and got these errors:
[...INSERT_ERROR_MESSAGES_HERE...]
</step>
<step>
Edited the file `test.ts` to add a missing import.
</step>
<step>
Ran the tests again and they passed.
</step>
</subgoal>

Notes:
- Every subgoal should have a description that explains the conditions to meet the subgoal concisely
- Every subgoal should have a status. It should begin as NOT_STARTED, moved to IN_PROGRESS and finally COMPLETE or ABANDONDED
- For every change you make, you should record it by adding a <step> under the appropriate subgoal.
- If you write to a file, must also record that you did so as a step
