const readline = require('readline');
const fs = require('fs');
const util = require('./util');

var commentDelimiter;

class Snippet {
  constructor(lang, name) {
    this.lang = lang
    this.name = name
    this.bodyBlock = ''
    this.innerBodyBlockArray = []
  }

  appendBody(newBlock) {
    this.innerBodyBlockArray.push(newBlock)
  }

  finishBody() {
    const s = this.innerBodyBlockArray.join('')
    this.bodyBlock = s.substring(0, s.length - 2)
  }
}

const setCommentDelimiter = function(demiliter) {
  commentDelimiter = demiliter
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
        if (snippet) {
          snippet.finishBody()
          snippets.push(snippet)
        }
        snippet = new Snippet(currentLang, name)
      } else if ((thisIsBodyBlockStart && mIsBodyBlockStart) && !(mIsIgnoreBlockStart || thisIsIgnoreBlockStart)) {
        snippet.appendBody(snakeSymbol(codeLine) + util.LINE_BREAKER)
      }

      mIsBodyBlockStart = thisIsBodyBlockStart
      mIsIgnoreBlockStart = thisIsIgnoreBlockStart
    })

    readInterface.on('close', function(codeLine) {
      if (snippet) {
        snippet.finishBody()
        snippets.push(snippet)
      }
      resolve(snippets)
    })
  })
}

// 将代码段插入文档
const injectCodeSnippet2Doc = async function (doc, getSnippetContent) {
  const tempDoc = doc + '.temp'
  const fd = fs.openSync(tempDoc, 'w')
  // const readInterface = readline.createInterface({
  //   input: fs.createReadStream(doc),
  //   output: process.stdout,
  //   terminal: false
  // })

  const docContent = util.loadFileContent(doc)

  var regex1 = RegExp('\\[//\\]\\s*:\\s*#\\s*\\(\\.cssg-snippet-([^)]+)\\)','g');
  const tagIndexes = []
  const codeBlockIndexes = []

  var array1;
  while ((array1 = regex1.exec(docContent)) !== null) {
    tagIndexes.push({
      name: array1[1],
      lastIndex: regex1.lastIndex
    })
  }

  regex1 = RegExp('```[^`(\\r|\\n||\\r\\n)]*(\\r|\\n||\\r\\n)','g');
  while ((array1 = regex1.exec(docContent)) !== null) {
    if (codeBlockIndexes.length % 2 == 0) {
      codeBlockIndexes.push(regex1.lastIndex)
    } else {
      codeBlockIndexes.push(regex1.lastIndex - array1[0].length)
    }
  }

  const buffer = []
  var start = 0
  for (const i in tagIndexes) {
    const segment = tagIndexes[i]
    const lastIndex = segment.lastIndex
    var codeStart, codeEnd
    for (var j = 0; j < codeBlockIndexes.length; j++) {
      if (codeBlockIndexes[j] > lastIndex) {
        codeStart = codeBlockIndexes[j]
        codeEnd = codeBlockIndexes[j + 1]
        break
      }
    }

    buffer.push(docContent.substring(start, codeStart))
    buffer.push(getSnippetContent(segment.name) + '\n')
    start = codeEnd
  }
  if (start < docContent.length) {
    buffer.push(docContent.substring(start))
  }

  fs.writeFileSync(fd, buffer.join(''))
  fs.closeSync(fd)
  fs.unlinkSync(doc)
  fs.renameSync(tempDoc, doc)
  return Promise.resolve(doc)
  
  // return new Promise((resolve, reject) => {
  //   var currSnippetName = null
  //   var isCodeBlockBackticksStart = false
  //   var isCodeBlockBackticksEnd = false

  //   readInterface.on('line', function(line) {
  //     const snippetName = parseSnippetBlockDefineInDoc(line)
  //     if (snippetName) {
  //       currSnippetName = snippetName
  //     }

  //     if (!isCodeBlockBackticksStart) {
  //       fs.writeSync(fd, line + '\n')
  //     }

  //     if (currSnippetName) {
  //       const isCodeBlockBackticks = parseCodeBlockBackticksInDoc(line) != null
  //       const preISCodeBlockBackticksStart = isCodeBlockBackticksStart
  //       isCodeBlockBackticksStart = preISCodeBlockBackticksStart || isCodeBlockBackticks
  //       isCodeBlockBackticksEnd = preISCodeBlockBackticksStart && isCodeBlockBackticks

  //       if (isCodeBlockBackticksEnd) {
  //         fs.writeSync(fd, getSnippetContent(currSnippetName) + '\n')
  //         fs.writeSync(fd, line + '\n')
  //         isCodeBlockBackticksStart = false
  //         currSnippetName = null
  //       }
  //     }

  //   })

  //   readInterface.on('close', function(line) {
  //     fs.closeSync(fd)
  //     fs.unlinkSync(doc)
  //     fs.renameSync(tempDoc, doc)
  //     resolve(doc)
  //   })
  // })
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
      const isCodeBlockBackticks = parseCodeBlockBackticksInDoc(line) != null

      if (isCodeBlockBackticks) {
        if (!isCodeBlockBackticksStart) {
          fs.writeSync(fd, `[//]: # (.cssg-snippet-)${util.LINE_BREAKER}`)
          isCodeBlockBackticksStart = true
        } else {
          isCodeBlockBackticksStart = false
        }
      }
      fs.writeSync(fd, line + util.LINE_BREAKER)
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
          currSnippet.bodyBlock = currSnippet.innerBodyBlockArray.join('')
          snippets.push(currSnippet)
          currSnippet = null
          currSnippetName = null
        }
      }

      if (currSnippet) {
        currSnippet.appendBody(line + util.LINE_BREAKER)
      }

    })

    readInterface.on('close', function(line) {
      resolve(snippets)
    })
  })
}

const snakeSymbol = function (line) {
  const matcher = line.trim().match(".>>({{.+}})<<.")
  return matcher ? line.replace(matcher[0], matcher[1]) : line;
}

const parseCodeBlockBackticksInDoc = function (line) {
  return line.trim().match('^```[^`]*$')
}

const parseSnippetBlockDefineInDoc = function (line) {
  const matcher = line.trim().match(`\\[//\\]\\s*:\\s*#\\s*\\(\\.cssg-snippet-([^)]+)\\)`)
  return matcher && matcher[1];
}

const parseBlockStartTagWithArg = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-${tag}-start): \\[(.+)\\]\\s*${commentDelimiter[1]}`)
  return matcher && matcher[2];
}

const parseBlockStartTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-${tag}-start)\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

const parseBlockEndTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-${tag}-end)\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

const parseMetadata = function (codeLine, meta) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*cssg-snippet-${meta}: \\[(.+)\\]\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

module.exports = {
  parseSnippetBody,
  injectCodeSnippet2Doc,
  taggingDoc,
  parseDOC2Prototype,
  Snippet,
  setCommentDelimiter
}
