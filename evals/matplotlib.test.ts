import { expect, test, describe, beforeEach } from 'bun:test'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { loopMainPrompt } from './scaffolding'
import { setupTestEnvironment, createInitialAgentState } from './test-setup'
import { passesSweBenchTests } from './swe-bench-eval'

describe('matplotlib', async () => {
  // Set up the test environment once for all tests
  const { repoPath, resetRepo } = await setupTestEnvironment('matplotlib')
  const initialAgentState = await createInitialAgentState(repoPath)

  // Reset repo before each test
  beforeEach(resetRepo)

  test(
    'bug fix',
    async () => {
      const prompt =
        'Fix the following bug. Only use the <complete> tool once you believe the bug has been fixed.\n\n[Bug]: Attribute Error combining matplotlib 3.7.1 and mplcursor on data selection\n### Bug summary\r\n\r\nIf you combine mplcursor and matplotlib 3.7.1, you\'ll get an `AttributeError: \'NoneType\' object has no attribute \'canvas\'` after clicking a few data points. Henceforth, selecting a new data point will trigger the same traceback. Otherwise, it works fine. \r\n\r\n### Code for reproduction\r\n\r\n```python\r\nimport numpy as np\r\nimport matplotlib.pyplot as plt\r\nimport mplcursors as mpl\r\n\r\nx = np.arange(1, 11)    \r\ny1 = x\r\n\r\nplt.scatter(x,y1)\r\n\r\nmpl.cursor()\r\nplt.show()\r\n```\r\n\r\n\r\n### Actual outcome\r\n\r\n```\r\nTraceback (most recent call last):\r\n  File "C:\\Users\\MrAni\\Python\\miniconda3\\lib\\site-packages\\matplotlib\\cbook\\__init__.py", line 304, in process\r\n    func(*args, **kwargs)\r\n  File "C:\\Users\\MrAni\\Python\\miniconda3\\lib\\site-packages\\matplotlib\\offsetbox.py", line 1550, in on_release\r\n    if self._check_still_parented() and self.got_artist:\r\n  File "C:\\Users\\MrAni\\Python\\miniconda3\\lib\\site-packages\\matplotlib\\offsetbox.py", line 1560, in _check_still_parented\r\n    self.disconnect()\r\n  File "C:\\Users\\MrAni\\Python\\miniconda3\\lib\\site-packages\\matplotlib\\offsetbox.py", line 1568, in disconnect\r\n    self.canvas.mpl_disconnect(cid)\r\n  File "C:\\Users\\MrAni\\Python\\miniconda3\\lib\\site-packages\\matplotlib\\offsetbox.py", line 1517, in <lambda>\r\n    canvas = property(lambda self: self.ref_artist.figure.canvas)\r\nAttributeError: \'NoneType\' object has no attribute \'canvas\'\r\n```\r\n\r\n### Expected outcome\r\n\r\nNo terminal output\r\n\r\n### Additional information\r\n\r\nUsing matplotlib 3.7.0 or lower works fine. Using a conda install or pip install doesn\'t affect the output. \r\n\r\n### Operating system\r\n\r\nWindows 11 and Windwos 10 \r\n\r\n### Matplotlib Version\r\n\r\n3.7.1\r\n\r\n### Matplotlib Backend\r\n\r\nQtAgg\r\n\r\n### Python version\r\n\r\n3.9.16\r\n\r\n### Jupyter version\r\n\r\n_No response_\r\n\r\n### Installation\r\n\r\nconda\n'
      await loopMainPrompt({
        agentState: initialAgentState,
        prompt,
        projectPath: repoPath,
        maxIterations: 100,
        stopCondition: (_, toolCalls) => {
          return toolCalls.some((call) => call.name === 'complete')
        },
      })
      expect(
        passesSweBenchTests('matplotlib__matplotlib-25442', repoPath)
      ).toBeTruthy()
    },
    { timeout: 10 * 60 * 60 * 1000 } // 10 hours
  )
})
