const readline = require('readline');
const fs = require('fs');

class Snippet {
  constructor(lang, name) {
    this.lang = lang
    this.name = name
    this.defineBlock = ''
    this.bodyBlock = ''
  }

  appendDefine(newBlock) {
    this.defineBlock = this.defineBlock.concat(newBlock)
  }

  appendBody(newBlock) {
    this.bodyBlock = this.bodyBlock.concat(newBlock)
  }
}

const parseDefine = async function (source) {
  const readInterface = readline.createInterface({
    input: fs.createReadStream(source),
    output: process.stdout,
    terminal: false
  })
  
  return new Promise((resolve, reject) => {
    var snippets = []

    var mIsDefineBlockStart = false
    var snippet = null
    var currentLang = null

    readInterface.on('line', function(codeLine) {
      const lang = parseMetadata(codeLine, 'lang')
      if (lang != null) {
        currentLang = lang
        return
      }

      var thisIsDefineBlockStart = mIsDefineBlockStart || parseBlockStartTag(codeLine, 'define') != null
      thisIsDefineBlockStart = thisIsDefineBlockStart && parseBlockEndTag(codeLine, 'define') == null

      if (thisIsDefineBlockStart && !mIsDefineBlockStart) {
        snippet = new Snippet(currentLang, null)
        snippets.push(snippet)
      }

      if (thisIsDefineBlockStart && mIsDefineBlockStart) {
        snippet.appendDefine(codeLine + '\n')
      }

      mIsDefineBlockStart = thisIsDefineBlockStart
    })

    readInterface.on('close', function(codeLine) {
      resolve(snippets)
    })
  })
}

// 解析主文件
const parseSnippetBody = async function (source) {
  const readInterface = readline.createInterface({
    input: fs.createReadStream(source),
    output: process.stdout,
    terminal: false
  })
  
  return new Promise((resolve, reject) => {
    var snippets = []

    var mIsBodyBlockStart = false
    var mIsIgnoreBlockStart = false

    var currentLang = null
    var snippet = null

    readInterface.on('line', function(codeLine) {
      const lang = parseMetadata(codeLine, 'lang')
      if (lang != null) {
        currentLang = lang
        return
      }

      var thisIsBodyBlockStart = mIsBodyBlockStart || parseBlockStartTag(codeLine, 'body') != null
      thisIsBodyBlockStart = thisIsBodyBlockStart && parseBlockEndTag(codeLine, 'body') == null

      var thisIsIgnoreBlockStart = mIsIgnoreBlockStart || parseBlockStartTag(codeLine, 'ignore') != null
      thisIsIgnoreBlockStart = thisIsIgnoreBlockStart && parseBlockEndTag(codeLine, 'ignore') == null

      if (thisIsBodyBlockStart && !mIsBodyBlockStart) {
        const name = parseBlockStartTagWithArg(codeLine, 'body')
        snippet = new Snippet(currentLang, name)
        snippets.push(snippet)
      } else if ((thisIsBodyBlockStart && mIsBodyBlockStart) && !(mIsIgnoreBlockStart || thisIsIgnoreBlockStart)) {
        snippet.appendBody(codeLine + '\r\n')
      }

      mIsBodyBlockStart = thisIsBodyBlockStart
      mIsIgnoreBlockStart = thisIsIgnoreBlockStart
    })

    readInterface.on('close', function(codeLine) {
      resolve(snippets)
    })
  })
}

// 将代码段插入文档
const injectCodeSnippet2Doc = async function (doc, getSnippetContent) {
  const tempDoc = doc + '.temp'
  const readInterface = readline.createInterface({
    input: fs.createReadStream(doc),
    output: process.stdout,
    terminal: false
  })
  
  const fd = fs.openSync(tempDoc, 'w')
  return new Promise((resolve, reject) => {
    var currSnippetName = null
    var isCodeBlockBackticksStart = false
    var isCodeBlockBackticksEnd = false

    readInterface.on('line', function(line) {
      const snippetName = parseSnippetBlockDefineInDoc(line)
      if (snippetName) {
        currSnippetName = snippetName
      }

      if (!isCodeBlockBackticksStart) {
        fs.writeSync(fd, line + '\r\n')
      }

      if (currSnippetName) {
        const isCodeBlockBackticks = parseCodeBlockBackticksInDoc(line) != null
        const preISCodeBlockBackticksStart = isCodeBlockBackticksStart
        isCodeBlockBackticksStart = preISCodeBlockBackticksStart || isCodeBlockBackticks
        isCodeBlockBackticksEnd = preISCodeBlockBackticksStart && isCodeBlockBackticks

        if (isCodeBlockBackticksEnd) {
          fs.writeSync(fd, getSnippetContent(currSnippetName) + '\r\n')
          fs.writeSync(fd, line + '\r\n')
          isCodeBlockBackticksStart = false
          currSnippetName = null
        }
      }

    })

    readInterface.on('close', function(line) {
      fs.closeSync(fd)
      fs.unlinkSync(doc)
      fs.renameSync(tempDoc, doc)
      resolve(doc)
    })
  })
}

// 辅助方法：文档内容插入标记
const taggingDoc = async function (doc) {
  const tempDoc = doc + '.temp'
  const readInterface = readline.createInterface({
    input: fs.createReadStream(doc),
    output: process.stdout,
    terminal: false
  })
  
  const fd = fs.openSync(tempDoc, 'w')
  return new Promise((resolve, reject) => {
    var isCodeBlockBackticksStart = false

    readInterface.on('line', function(line) {
      const isCodeBlockBackticks = parseCodeBlockBackticks(line) != null

      if (isCodeBlockBackticks) {
        if (!isCodeBlockBackticksStart) {
          fs.writeSync(fd, '[//]: # (.cssg-snippet-)\r\n')
          isCodeBlockBackticksStart = true
        } else {
          isCodeBlockBackticksStart = false
        }
      }
      fs.writeSync(fd, line + '\r\n')
    })

    readInterface.on('close', function(line) {
      fs.closeSync(fd)
      fs.unlinkSync(doc)
      fs.renameSync(tempDoc, doc)
      resolve(doc)
    })
  })
}

// 辅助方法：将文档内容生成主文件
const parseDOC2Prototype = async function (doc) {
  const readInterface = readline.createInterface({
    input: fs.createReadStream(doc),
    output: process.stdout,
    terminal: false
  })
  
  return new Promise((resolve, reject) => {
    var snippets = []
    var currSnippet = null

    var currSnippetName = null
    var isCodeBlockBackticksStart = false

    readInterface.on('line', function(line) {
      const snippetName = parseSnippetBlockDefineInDoc(line)
      if (snippetName) {
        currSnippetName = snippetName
        isCodeBlockBackticksStart = false
        return
      }

      const isCodeBlockBackticks = parseCodeBlockBackticksInDoc(line) != null
      if (isCodeBlockBackticks && currSnippetName) {
        if (!isCodeBlockBackticksStart) {
          isCodeBlockBackticksStart = true
          currSnippet = new Snippet(null, currSnippetName)
          return
        } else {
          isCodeBlockBackticksStart = false
          snippets.push(currSnippet)
          currSnippet = null
          currSnippetName = null
        }
      }

      if (currSnippet) {
        currSnippet.appendBody(line + '\r\n')
      }

    })

    readInterface.on('close', function(line) {
      resolve(snippets)
    })
  })
}

const parseCodeBlockBackticksInDoc = function (line) {
  return line.trim().match('^```[^`]*$')
}

const parseSnippetBlockDefineInDoc = function (line) {
  const matcher = line.trim().match(`\\[//\\]\\s*:\\s*#\\s*\\(\\.cssg-snippet-([^)]+)\\)`)
  return matcher && matcher[1];
}

const parseBlockStartTagWithArg = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`\\/\\/\\s*\\.(cssg-${tag}-start): \\[(.+)\\]`)
  return matcher && matcher[2];
}

const parseBlockStartTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`\\/\\/\\s*\\.(cssg-${tag}-start)`)
  return matcher && matcher[1];
}

const parseBlockEndTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`\\/\\/\\s*\\.(cssg-${tag}-end)`)
  return matcher && matcher[1];
}

const parseMetadata = function (codeLine, meta) {
  const matcher = codeLine.trim().match(`\\/\\/\\s*cssg-snippet-${meta}: \\[(.+)\\]`)
  return matcher && matcher[1];
}

module.exports = {
  parseDefine,
  parseSnippetBody,
  injectCodeSnippet2Doc,
  taggingDoc,
  parseDOC2Prototype,
  Snippet
}
