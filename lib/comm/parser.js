const readline = require('readline');
const fs = require('fs');
const util = require('./util');

var commentDelimiter;

class Snippet {
  constructor(lang, name) {
    this.lang = lang
    this.name = name
    this.group = ''
    this.bodyBlock = ''
    this.innerBodyBlockArray = []
  }

  setGroup(name) {
    this.group = name
  }

  appendBody(newBlock) {
    this.innerBodyBlockArray.push(newBlock)
  }

  finishBody() {
    this.bodyBlock = this.innerBodyBlockArray.join(util.LINE_BREAKER).trimRight()
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
          // 忽略空的代码块
          if (snippet.bodyBlock.trim().length) {
            snippets.push(snippet)
          }
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

// 文档里面一个节点，通常以单行1..5个连续的 # 开始
class SegmentNode {
  constructor(level, title) {
    // 父节点
    this.parent = null
    // 结点在文档中的偏移
    this.indexes = []
    // 结点自身内容
    this.content = ''
    // 子节点
    this.children = []
    // 换行符
    this.lineBreaker = ''
    // 级别，越小级别越高，等于标题有多少个#号
    this.level = level
    // 标题
    this.title = title

    // 文档结点相关
    // 代码段标签名称
    this.tagName = ''
    // 子节点是不是代码段节点
    this.childIsCodeNode = false
  }
}

const treeify = function(docContent) {
  const root = new SegmentNode(0, null)

  var regex1 = /^(#{1,5})\s+(\S+)/gm
  var aboveNode = root // 上一个结点
  var array1;
  while ((array1 = regex1.exec(docContent)) !== null) {
    const level = array1[1].length
    const title = array1[2]
    const node = new SegmentNode(level, title)
    node.lineBreaker = '\n'
    // 开始
    node.indexes.push(regex1.lastIndex - array1[0].length)

    var n = aboveNode
    while (n) {
      if (n.level < level) {
        node.parent = n
        n.children.push(node)
        break
      }
      n = n.parent
    }
    if (aboveNode.parent) {
      aboveNode.indexes.push(node.indexes[0] - 1)
      handleNodeContent(aboveNode, docContent)
    }

    aboveNode = node
  }

  // 结束结点
  aboveNode.indexes.push(docContent.length)
  handleNodeContent(aboveNode, docContent)
  

  return root
}

const handleNodeContent = function(node, docContent) {
  if (node.indexes[1] < 0 || node.indexes[1] >= docContent.length) {
    node.content = docContent.substring(node.indexes[0])
  } else {
    node.content = docContent.substring(node.indexes[0], node.indexes[1] + 1)
  }
  // 处理文档结点
  var regex2 = RegExp('\\[//\\]\\s*:\\s*#\\s*\\(\\.cssg-snippet-([^)]+)\\)','g')
  var array2;
  if ((array2 = regex2.exec(node.content)) !== null) {
    node.tagName = array2[1]
    node.parent.childIsCodeNode = true
  }
}

// 将代码段插入文档
const injectCodeSnippet2Doc = async function (doc, lang, getSnippetContent, 
  getRealWebUrl) {
  const tempDoc = doc + '.temp'
  const fd = fs.openSync(tempDoc, 'w')

  const docContent = util.loadFileContent(doc)

  const root = treeify(docContent)

  const buffer = []
  recursiveWrite(root, buffer, lang, getSnippetContent, getRealWebUrl)

  fs.writeFileSync(fd, buffer.join(''))
  fs.closeSync(fd)
  fs.unlinkSync(doc)
  fs.renameSync(tempDoc, doc)
  return Promise.resolve(doc)
}

const recursiveWrite = function(node, buffer, lang, getSnippetContent, 
  getRealWebUrl) {
    var snippet;
    if (node.tagName) {
      // 文档节点
      snippet = getSnippetContent(node.tagName)
      if (!snippet) {
        // 找不到代码块，丢弃当前节点跟子节点
        return
      }
    }

    var content = node.content
    // 替换url为真实url
    regex1 = RegExp('\\(cssg://(.+)\\)','g');
    while ((array1 = regex1.exec(content)) !== null) {
      const realUrl = getRealWebUrl(array1[1])
      if (realUrl) {
        content = content.replace(array1[0], '(' + realUrl + ')')
      }
    }

    if (snippet) {
      // 找到代码块开始结束符号在内容里的偏移
      const codeIndexes = []
      var regex2 = RegExp('```','g');
      while ((array2 = regex2.exec(content)) !== null) {
        codeIndexes.push(regex2.lastIndex - array2[0].length)
      }

      buffer.push(content.substring(0, codeIndexes[0]))
      buffer.push('```' + lang + node.lineBreaker)
      buffer.push(snippet + node.lineBreaker)
      buffer.push(content.substring(codeIndexes[1]))
    } else {
      buffer.push(content)
    }

    const bufferLength = buffer.length
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        recursiveWrite(node.children[i], buffer, lang, getSnippetContent, 
          getRealWebUrl)
      }
    }
    if (node.childIsCodeNode && !snippet && buffer.length == bufferLength) {
      // 说明子节点的代码段全是空，那么同步删除当前节点的内容
      buffer.pop()
    }
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
  // 从示例代码文件中获取代码段
  getSnippetsFromCase,
  // 从文档里面获取代码段
  getSnippetsFromDoc,
  // 插入代码到文档中
  injectCodeSnippet2Doc,
  // 代码块
  Snippet,
  // 设置注释符号
  setCommentDelimiter,
  // 获取代码块注释开始标签
  getSnippetBodyCommentStart,
  // 获取代码块注释结束标签
  getSnippetBodyCommentEnd
}