var fs = require('fs');
var path = require('path');

const LINE_BREAKER = "\n"
const TAB = "    "
const TAB_SIZE = 4

const splitLines = function (body) {
  return body.split(/(?:\r\n|\r|\n)/g)
}

const getSnippetsRoot = function (root) {
  return path.join(root, 'snippets')
}

const getSnippetFile = function (snippetsRoot, snippetName) {
  return path.join(snippetsRoot, snippetName + '.snippet')
}

const loadEntryConfig = function(root, configFileName) {
  const configFile = path.join(root, configFileName)
  return JSON.parse(fs.readFileSync(configFile))
}

const applyBaseConfig = function(config, g) {
  const nc = {}
  Object.keys(g).forEach(function(key) {
    nc[key] = eval('`' + g[key] + '`')
  });
  Object.keys(config).forEach(function(key) {
    nc[key] = eval('`' + config[key] + '`')
  });
  return nc
}

const traverseFiles = function(root, ext) {
  var results = [];

  var list = fs.readdirSync(root);
  list.forEach(function(file) {
      file = path.resolve(root, file);
      var stat = fs.statSync(file);
      if (stat && stat.isDirectory()) { 
          /* Recurse into a subdirectory */
          results = results.concat(traverseFiles(file, ext));
      } else if (file.endsWith(ext)) {
          /* Is a file */
          results.push(file);
      }
  });

  return results; 
}

const saveFile = function (path, content) {
  var stream = fs.createWriteStream(path)
  stream.once('open', function(fd) {
    stream.write(content)
    stream.end()
  })
}

const loadFileContent = function (path) {
  return fs.readFileSync(path, 'utf-8')
}

module.exports = {
  getSnippetsRoot,
  getSnippetFile,
  loadEntryConfig,
  applyBaseConfig,
  traverseFiles,
  saveFile,
  loadFileContent,
  splitLines,
  LINE_BREAKER,
  TAB
}