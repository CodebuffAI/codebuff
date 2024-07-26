
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, 'package.json');
const tempPackageJsonPath = path.join(__dirname, 'temp.package.json');
const indexJsPath = path.join(__dirname, 'dist', 'index.js');

const packageJson = require(packageJsonPath);

// Save the current package.json to temp.package.json
fs.writeFileSync(tempPackageJsonPath, JSON.stringify(packageJson, null, 2));

delete packageJson.devDependencies;
delete packageJson.peerDependencies;

// Write the cleaned package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// Add NODE_ENV setting to index.js
if (fs.existsSync(indexJsPath)) {
  let indexJsContent = fs.readFileSync(indexJsPath, 'utf8');
  const envLine = "process.env.NODE_ENV = 'production';";
  
  if (!indexJsContent.includes(envLine)) {
    const lines = indexJsContent.split('\n');
    lines.splice(1, 0, envLine); // Insert after the shebang line
    indexJsContent = lines.join('\n');
    fs.writeFileSync(indexJsPath, indexJsContent);
    console.log('NODE_ENV setting added to index.js');
  } else {
    console.log('NODE_ENV setting already exists in index.js');
  }
} else {
  console.error('index.js not found in the dist directory');
}

console.log('package.json has been cleaned for publishing and index.js has been updated.');
