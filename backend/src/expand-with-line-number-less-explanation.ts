import fs from 'fs'

import { debugLog } from './util/debug'
import { Message } from 'common/actions'
import { createFileBlock } from 'common/util/file'
import { promptOpenAI, promptOpenAIStream } from './openai-api'

export async function expandNewContentUsingLineNumbers(
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
): Promise<string> {
  const oldContentWithoutLastNewLine = oldContent.endsWith('\n')
    ? oldContent.slice(0, -1)
    : oldContent
  const oldContentWithLineNumbers = oldContentWithoutLastNewLine
    .split('\n')
    .map((line, index) => `${index + 1} ${line}`)
    .join('\n')
  console.log('oldContentWithLineNumbers', oldContentWithLineNumbers)

  const prompt = `
I have an old file and a new file with placeholder comments that give instructions on how to edit the old file. I want you to expand the new file into a complete version of the file with the edit applied. However, to make this more efficient, instead of writing any lines from the old program, you should write out the line number when you want that line from the old file replicated in the final file. If there are more than one line numbers in a row, write them as a range (e.g. 1-3).

Your response should follow the following format:
Please discuss the changes in the new file content compared to the old file content in a <discussion> block.

Secondly, in a <comments-to-expand> block, please create a numbered list of the comments that should be expanded, in order from the new file.
If there are no comments to expand, leave the block empty: <comments-to-expand></comments-to-expand>

Lastly, create a <file path="path/to/file.ts"> block with the the content of the new file, but for each placeholder comment, replace it with an <insert> block:
<insert>
A line to be copied including the line number
</insert>

Or, for a range of lines, write:
<insert>
The first line to be copied including the line number
The last line to be copied including the line number
</insert>

Example 1:

Old:
<file path="path/to/file.ts">
1 console.log('hello')
2 console.log('world')
</file>

New (with placeholder comments):
<file path="path/to/file.ts">
// ... existing code ...
console.log('people')
</file>

Then you would output:

<discussion>
The 'world' console.log is changed to 'people'.
</discussion>

<comments-to-expand>
1. // ... existing code ...
</comments-to-expand>

<rewritten-file path="path/to/file.ts">
<insert>
1 console.log('hello')
</insert>
console.log('people')
</rewritten-file>

Example 2:

Old:
<file path="path/to/complex-file.ts">
1 import { useState, useEffect } from 'react';
2 
3 function ComplexComponent() {
4   const [data, setData] = useState(null);
5 
6   useEffect(() => {
7     fetchData();
8   }, []);
9 
10   const fetchData = async () => {
11     // Fetch data from API
12     const response = await fetch('https://api.example.com/data');
13     const result = await response.json();
14     setData(result);
15   };
16 
17   return (
18     <div>
19       <h1>Complex Component</h1>
20       {data ? (
21         <ul>
22           {data.map(item => (
23             <li key={item.id}>{item.name}</li>
24           ))}
25         </ul>
26       ) : (
27         <p>Loading...</p>
28       )}
29     </div>
30   );
31 }
32 
33 export default ComplexComponent;
</file>

New (with placeholder comments):
<file path="path/to/complex-file.ts">
// ... existing imports ...

function ComplexComponent() {
  // ... existing state and effect ...

  const fetchData = async () => {
    // ... existing fetch logic ...
    setData(result.filter(item => item.active));
  };

  // ... existing return statement ...
}

// ... existing export ...
</file>

Then you would output:
<discussion>
The main change in this file is within the fetchData function. Instead of setting the data directly with the result from the API, it now filters the result to only include active items before setting the data.
</discussion>

<comments-to-expand>
1. // ... existing imports ...
2. // ... existing state and effect ...
3. // ... existing fetch logic ...
4. // ... existing return statement ...
5. // ... existing export ...
</comments-to-expand>

<rewritten-file path="path/to/complex-file.ts">
<insert>
1 import { useState, useEffect } from 'react';
</insert>

function ComplexComponent() {
<insert>
4   const [data, setData] = useState(null);
8   }, []);
</insert>

  const fetchData = async () => {
<insert>
11     const response = await fetch('https://api.example.com/data');
13     const result = await response.json();
</insert>
    setData(result.filter(item => item.active));
  };

<insert>
17   return (
30   );
</insert>
}

<insert>
33 export default ComplexComponent;
</insert>
</rewritten-file>

Example 3:

Old:
<file path="data_processor.py">
1  import pandas as pd
2  import numpy as np
3  from sklearn.preprocessing import StandardScaler
4  
5  def load_data(file_path):
6      return pd.read_csv(file_path)
7  
8  def preprocess_data(df):
9      # Drop rows with missing values
10     df.dropna(inplace=True)
11     
12     # Convert categorical variables to one-hot encoding
13     df = pd.get_dummies(df, columns=['category', 'subcategory'])
14     
15     # Normalize numerical features
16     scaler = StandardScaler()
17     numerical_features = ['age', 'income', 'score']
18     df[numerical_features] = scaler.fit_transform(df[numerical_features])
19     
20     return df
21 
22 def analyze_data(df):
23     # Calculate basic statistics
24     stats = df.describe()
25     
26     # Calculate correlation matrix
27     corr_matrix = df.corr()
28     
29     return stats, corr_matrix
30 
31 if __name__ == "__main__":
32     file_path = "data.csv"
33     raw_data = load_data(file_path)
34     processed_data = preprocess_data(raw_data)
35     stats, corr_matrix = analyze_data(processed_data)
36     
37     print("Basic Statistics:")
38     print(stats)
39     print("\nCorrelation Matrix:")
40     print(corr_matrix)
</file>

New (with placeholder comments):
<file path="data_processor.py">
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

# ... existing load_data function ...

def preprocess_data(df):
    # ... existing preprocessing steps ...
    
    # Add feature engineering
    df['age_group'] = pd.cut(df['age'], bins=[0, 18, 30, 50, 100], labels=['0-18', '19-30', '31-50', '51+'])
    df = pd.get_dummies(df, columns=['age_group'])
    
    return df

# ... remove analyze_data function ...

def train_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    return model, X_test, y_test

def evaluate_model(model, X_test, y_test):
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred)
    return accuracy, report

if __name__ == "__main__":
    # ... existing data loading and processing ...
    
    # Prepare data for modeling
    X = processed_data.drop('target', axis=1)
    y = processed_data['target']
    
    # Train and evaluate model
    model, X_test, y_test = train_model(X, y)
    accuracy, report = evaluate_model(model, X_test, y_test)
    
    print(f"Model Accuracy: {accuracy:.2f}")
    print("Classification Report:")
    print(report)
</file>

Then you would output:

<discussion>
The main changes in this file include:
Adding new imports for machine learning functionality (train_test_split, RandomForestClassifier, accuracy_score, classification_report)
Modifying the preprocess_data function to include feature engineering (adding age_group)
Removing the analyze_data function
Adding new functions train_model and evaluate_model for machine learning tasks
Updating the main block to perform model training and evaluation instead of basic data analysis
</discussion>

<comments-to-expand>
1. // ... existing load_data function ...
2. // ... existing preprocessing steps ...
3. // ... remove analyze_data function ...
4. // ... existing data loading and processing ...
</comments-to-expand>

<rewritten-file path="data_processor.py">
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

<insert>
5 def load_data(file_path):
6     return pd.read_csv(file_path)
</insert>

def preprocess_data(df):
<insert>
9     # Drop rows with missing values
18     df[numerical_features] = scaler.fit_transform(df[numerical_features])
</insert>
    
    # Add feature engineering
    df['age_group'] = pd.cut(df['age'], bins=[0, 18, 30, 50, 100], labels=['0-18', '19-30', '31-50', '51+'])
    df = pd.get_dummies(df, columns=['age_group'])
    
    return df

def train_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    return model, X_test, y_test

def evaluate_model(model, X_test, y_test):
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred)
    return accuracy, report

if __name__ == "__main__":
<insert>
32     file_path = "data.csv"
34     processed_data = preprocess_data(raw_data)
</insert>
    
    # Prepare data for modeling
    X = processed_data.drop('target', axis=1)
    y = processed_data['target']
    
    # Train and evaluate model
    model, X_test, y_test = train_model(X, y)
    accuracy, report = evaluate_model(model, X_test, y_test)
    
    print(f"Model Accuracy: {accuracy:.2f}")
    print("Classification Report:")
    print(report)
</rewritten-file>

Now, please output the expanded file given these input files:
Old:
${createFileBlock(filePath, oldContentWithLineNumbers)}
New (with placeholder comments):
${createFileBlock(filePath, newContent)}
`.trim()

  console.log('beginning line number expansion call')
  const stream = await promptOpenAIStream(
    userId,
    [
      {
        role: 'user',
        content: prompt,
      },
    ],
    'gpt-4o-2024-08-06'
  )

  let expandedContentResponse = ''
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)
      expandedContentResponse += content
    }
  }

  debugLog('New file (unexpanded) for filePath', filePath, newContent)
  debugLog(
    'Expanded content response for filePath',
    filePath,
    expandedContentResponse
  )

  let expandedContent = processExpandedContentResponse(
    expandedContentResponse,
    oldContentWithoutLastNewLine.split('\n')
  )

  if (oldContent.endsWith('\n') && !expandedContent.endsWith('\n')) {
    expandedContent = expandedContent + '\n'
  }

  fs.writeFileSync('expand-test.ts', expandedContent)

  return expandedContent
}

function processExpandedContentResponse(
  expandedContentResponse: string,
  oldLines: string[]
): string {
  const fileBlockMatch = expandedContentResponse.match(
    /<rewritten-file.*?>([\s\S]*?)<\/rewritten-file>/
  )
  if (!fileBlockMatch) {
    console.error('No file block found in the response')
    return expandedContentResponse
  }

  let fileContent = fileBlockMatch[1]
  const insertBlocks = fileContent.match(/<insert>[\s\S]*?<\/insert>/g) || []

  for (const insertBlock of insertBlocks) {
    const lines = insertBlock.split('\n').slice(1, -1)
    console.log('lines', lines)

    const [startLine, ...restOfTheStartLine] = (lines[0] ?? 'NaN ').split(' ')
    const startLineStr = restOfTheStartLine.join(' ')
    const [endLine, ...restOfTheEndLine] = (
      lines[lines.length - 1] ?? 'NaN '
    ).split(' ')
    const endLineStr = restOfTheEndLine.join(' ')
    let startLineNumber = parseInt(startLine)
    let endLineNumber = parseInt(endLine)
    console.log('got start, end', startLineNumber, endLineNumber)
    if (!isNaN(startLineNumber) && isNaN(endLineNumber)) {
      endLineNumber = startLineNumber
    }
    if (isNaN(startLineNumber) || isNaN(endLineNumber)) {
      continue
    }
    const indexOfStartLine =
      oldLines.findIndex(
        (line, index) =>
          line === startLineStr &&
          index >= startLineNumber - 2 &&
          index <= startLineNumber
      ) + 1
    const indexOfEndLine =
      oldLines.findIndex(
        (line, index) =>
          line === endLineStr &&
          index >= endLineNumber - 2 &&
          index <= endLineNumber
      ) + 1
    console.log(
      startLineStr,
      'indexOfStartLine',
      indexOfStartLine,
      endLineStr,
      'indexOfEndLine',
      indexOfEndLine
    )
    const lineRange = `${indexOfStartLine}-${indexOfEndLine}`
    const replacementContent = getLineRangeSlice(oldLines, lineRange)
    fileContent = fileContent.replace(insertBlock, replacementContent)
  }

  return fileContent
}

function getLineRangeSlice(lines: string[], lineRange: string): string {
  if (lineRange.toLowerCase() === 'none') {
    return ''
  }

  const lineNumberMatch = lineRange.trim().match(/^(\d+)-(\d+)$/)
  if (lineNumberMatch) {
    const startLineNumber = parseInt(lineNumberMatch[1])
    const endLineNumber = parseInt(lineNumberMatch[2])
    if (
      !isNaN(startLineNumber) &&
      !isNaN(endLineNumber) &&
      startLineNumber <= endLineNumber
    ) {
      return lines.slice(startLineNumber - 1, endLineNumber).join('\n')
    }
  }
  console.error('Failed to parse line range!', lineRange)
  return ''
}
