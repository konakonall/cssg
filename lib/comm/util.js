var fs = require('fs');
var path = require('path');
var ncp = require('ncp').ncp;

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

const copyDirectory = function(src, dest) {
  return new Promise((resolve, reject) => {
    ncp(src, dest, function(err) {
      if (err) {
        reject(err)
      } else {
        resolve(dest)
      }
    })
  })
}

const loadFileContent = function (path) {
  return fs.readFileSync(path, 'utf-8')
}


const getSnippetIndentation = function (template) {
  const lines = splitLines(template)
  var findMethodTag = false
  for (const i in lines) {
    const lineCode = lines[i]
    if (!findMethodTag) {
      findMethodTag = lineCode.match("(\\s*){{2,3}#methods}{2,3}\\s*")
    }
    if (findMethodTag) {
      const matcher = lineCode.match("(\\s*){{2,3}snippet}{2,3}\\s*")
      if (matcher) {
        return matcher[1].length
      }
    }
  }
}

const getNameByConvension = function (name, convension) {
  const array = name.split('-')
  var newName = ''
  for (var i in array) {
    if (convension == 'lower-camel' && i == 0) {
      newName = newName.concat(array[i].charAt(0).toLowerCase()
        + array[i].substring(1))
    } else if (convension == 'lower-camel' || convension == 'upper-camel') {
      newName = newName.concat(array[i].charAt(0).toUpperCase()
        + array[i].substring(1))
    } else if (convension == 'under-score') {
      if (i > 0) {
        newName = newName.concat('_')
      }
      newName = newName.concat(array[i].toLowerCase())
    }
  }
  return newName
}

module.exports = {
  getSnippetsRoot,
  getSnippetFile,
  loadEntryConfig,
  applyBaseConfig,
  traverseFiles,
  saveFile,
  copyDirectory,
  loadFileContent,
  splitLines,
  getNameByConvension,
  getSnippetIndentation,
  LINE_BREAKER,
  TAB
}