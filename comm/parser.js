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
    this.bodyBlock = this.innerBodyBlockArray.join(util.LINE_BREAKER)
  }
}

const setCommentDelimiter = function(demiliter) {
  commentDelimiter = demiliter
}

const getSnippetBodyCommentStart = function(name) {
  return `${commentDelimiter[0]}.cssg-snippet-body-start:[${name}]${commentDelimiter[1]}`
}

const getSnippetBodyCommentEnd = function() {
  return `${commentDelimiter[0]}.cssg-snippet-body-end${commentDelimiter[1]}`
}

// 从测试用例中抽取代码片段
const getSnippetsFromCase = async function (source) {
  const readInterface = readline.createInterface({
    input: fs.createReadStream(source),
    output: process.stdout,
    terminal: false
  })
  
  return new Promise((resolve, reject) => {
    var snippets = []

    var mIsBodyBlockStart = false

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

      if (thisIsBodyBlockStart && !mIsBodyBlockStart) {
        const name = parseBlockStartTagWithArg(codeLine, 'body')
        if (snippet) {
          snippet.finishBody()
          snippets.push(snippet)
        }
        snippet = new Snippet(currentLang, name)
      } else if (thisIsBodyBlockStart && mIsBodyBlockStart) {
        snippet.appendBody(codeLine)
      }

      mIsBodyBlockStart = thisIsBodyBlockStart
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
    // 键值对，0表示开始，1表示结束，依次往后排
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
    const snippet = getSnippetContent(segment.name)
    if (snippet) {
      buffer.push(getSnippetContent(segment.name) + '\n')
    } else {
      buffer.push(docContent.substring(codeStart, codeEnd))
    }
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

// 辅助方法：在文档插入注释
const namesMapping = {
  "GET Bucket（List Object）": "get-bucket",
  "GET Bucket Object Versions": "list-object-versioning",
  "PUT Object": "put-object",
  "HEAD Object": "head-object",
  "GET Object": "get-object",
  "PUT Object - Copy": "copy-object",
  "DELETE Object": "delete-object",
  "DELETE Multiple Objects": "delete-multi-object",

  "List Multipart Uploads": "list-multi-upload",
  "Initiate Multipart Upload": "init-multi-upload",
  "Upload Part": "upload-part",
  "Upload Part - Copy": "upload-part-copy",
  "List Parts": "list-parts",
  "Complete Multipart Upload": "complete-multi-upload",
  "Abort Multipart Upload": "abort-multi-upload",

  "POST Object restore": "restore-object",
  "PUT Object acl": "put-object-acl",
  "GET Object acl": "get-object-acl",

  "PUT Bucket cors": "put-bucket-cors",
  "GET Bucket cors": "get-bucket-cors",
  "DELETE Bucket cors": "delete-bucket-cors",

  "PUT Bucket lifecycle": "put-bucket-lifecycle",
  "GET Bucket lifecycle": "get-bucket-lifecycle",
  "DELETE Bucket lifecycle": "delete-bucket-lifecycle",

  "PUT Bucket versioning": "put-bucket-versioning",
  "GET Bucket versioning": "get-bucket-versioning",

  "PUT Bucket replication": "put-bucket-replication",
  "GET Bucket replication": "get-bucket-replication",
  "DELETE Bucket replication": "delete-bucket-replication",

  "GET Service": "get-service",
  "PUT Bucket": "put-bucket",
  "HEAD Bucket": "head-bucket",
  "DELETE Bucket": "delete-bucket",

  "PUT Bucket acl": "put-bucket-acl",
  "GET Bucket acl": "get-bucket-acl"
}

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
    var isSnippetCodeSection = false

    var isIntroSection = false
    var oneByOneNames = []
    var nextNameIdx = 0

    readInterface.on('line', function(line) {
      const isCodeBlockBackticks = parseCodeBlockBackticksInDoc(line) != null

      if ("## 简介" == line) {
        isIntroSection = true
        fs.writeSync(fd, line + util.LINE_BREAKER)
        return
      }

      if (isIntroSection) {
        if (line.startsWith("##")) {
          isIntroSection = false
        } else {
          for (const name in namesMapping) {
            if (line.includes(`[${name}]`)) {
              oneByOneNames.push(namesMapping[name])
              break
            }
          }
        }
      }

      if ("#### 请求示例" == line) {
        isSnippetCodeSection = true
      }

      if (isSnippetCodeSection && isCodeBlockBackticks) {
        if (!isCodeBlockBackticksStart) {
          var name = ''
          if (oneByOneNames.length > nextNameIdx) {
            name = oneByOneNames[nextNameIdx++]
          }
          fs.writeSync(fd, `[//]: # (.cssg-snippet-${name})${util.LINE_BREAKER}`)
          isCodeBlockBackticksStart = true
        } else {
          isCodeBlockBackticksStart = false
          isSnippetCodeSection = false
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

// 从文档中利用注释抽取代码片段
const getSnippetsFromDoc = async function (doc) {
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
      while (line.indexOf('\t') != -1) {
        line = line.replace('\t', util.TAB);
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
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-snippet-${tag}-start):\\s*\\[(.+)\\]\\s*${commentDelimiter[1]}`)
  return matcher && matcher[2];
}

const parseBlockStartTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-snippet-${tag}-start)\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

const parseBlockEndTag = function (codeLine, tag) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*\\.(cssg-snippet-${tag}-end)\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

const parseMetadata = function (codeLine, meta) {
  const matcher = codeLine.trim().match(`${commentDelimiter[0]}\\s*cssg-snippet-${meta}: \\[(.+)\\]\\s*${commentDelimiter[1]}`)
  return matcher && matcher[1];
}

module.exports = {
  getSnippetsFromCase,
  getSnippetsFromDoc,
  injectCodeSnippet2Doc,
  taggingDoc,
  Snippet,
  setCommentDelimiter,
  getSnippetBodyCommentStart,
  getSnippetBodyCommentEnd
}
