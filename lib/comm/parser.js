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
    if (this.innerBodyBlockArray.length > 0 || newBlock.trim().length > 0) {
      this.innerBodyBlockArray.push(newBlock)
    }
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
        if (snippet.bodyBlock.trim().length) {
          snippets.push(snippet)
        }
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
    this.tagNames = []
    // 子节点是不是代码段节点
    this.childIsCodeNode = false
  }
}

const treeify = function(docContent) {
  const root = new SegmentNode(0, null)

  var regex1 = /^(#{1,5})\s+(.+)/gm
  var aboveNode = root // 上一个结点
  var array1;
  while ((array1 = regex1.exec(docContent)) !== null) {
    const level = array1[1].length
    const title = array1[0]
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
  while ((array2 = regex2.exec(node.content)) !== null) {
    node.tagNames.push(array2[1])
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

const codeIndexNaming = ['', '一','二','三','四','五','六','七','八','九','十']

const recursiveWrite = function(node, buffer, lang, getSnippetContent, 
  getRealWebUrl, codeIndex = 0) {
    const snippets = [];
    if (node.tagNames.length > 0) {
      for (var i in node.tagNames) {
        // 文档节点
        const snippet = getSnippetContent(node.tagNames[i])
        if (snippet) {
          snippets.push(snippet)
        }
      }
      if (snippets.length < 1) {
        // 找不到代码块，丢弃当前节点跟子节点
        return false
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

    if (snippets.length > 0) {
      // 替换标题序号
      const i = codeIndexNaming[codeIndex]
      const title = eval('`' + node.title + '`')
      content = content.replace(node.title, title)

      // 找到代码块开始结束符号在内容里的偏移
      const codeIndexes = []
      var regex2 = RegExp('```','g');
      while ((array2 = regex2.exec(content)) !== null) {
        codeIndexes.push(regex2.lastIndex - array2[0].length)
      }

      buffer.push(content.substring(0, codeIndexes[0]))
      for(var j = 0, lastEnd = 0; j < codeIndexes.length; j += 2) {
        buffer.push('```' + lang + node.lineBreaker)
        buffer.push(snippets[j / 2] + node.lineBreaker)
        if (j < codeIndexes.length - 2) {
          buffer.push(content.substring(codeIndexes[j + 1], codeIndexes[j + 2]))
        } else {
          buffer.push(content.substring(codeIndexes[j + 1]))
        }
      }
      if (j == codeIndexes.length - 2) {
        buffer.push(content.substring(codeIndexes[j + 1]))
      }
      lastEnd = codeIndexes[j + 1]
    } else {
      buffer.push(content)
    }

    if (node.children) {
      // 一共多少个代码段
      var codeChildSize = 0
      // 代码段序号索引
      var codeChildIndex = {}

      // 代码节点预处理
      if (node.childIsCodeNode) {
        for (var i = 0; i < node.children.length; i++) {
          const child = node.children[i]
          for (var j in child.tagNames) {
            const snippet = getSnippetContent(child.tagNames[j])
            if (snippet) {
              codeChildIndex[i] = ++codeChildSize
              break
            }
          }
        }
        if (codeChildSize < 1) {
          // 所有代码节点都是空，丢弃当前节点
          buffer.pop()
          return false
        }
      }

      for (var i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        const subIndex = child.tagNames.length > 0 && codeChildSize > 1 ? 
        codeChildIndex[i] : 0
        recursiveWrite(child, buffer, lang, getSnippetContent, 
          getRealWebUrl, subIndex)
      }
    }

    return true
}

const injectCodeSnippet2DocOld = async function (doc, getSnippetContent) {
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
}

// 合并文档
// 对于节点名相同但是内容不同的节点，去合集，加上标记
const mergeDocsForMultiLanguage = function(doc1, label1, doc2, label2) {
  const tempDoc = doc1 + '.tmp'
  const fd = fs.openSync(tempDoc, 'w')

  const root1 = treeify(util.loadFileContent(doc1))
  const root2 = treeify(util.loadFileContent(doc2))

  const buffer = []
  mergeNode(buffer, root1, label1, root2, label2)

  fs.writeFileSync(fd, buffer.join(''))
  fs.closeSync(fd)
  fs.unlinkSync(doc1)
  fs.renameSync(tempDoc, doc1)

  return Promise.resolve(doc1)
}

const mergeNode = function(buffer, node1, label1, node2, label2) {
  if (node1 && node2 && node1.content != node2.content) {
    // 代码节点
    buffer.push(node1.title)
    buffer.push(node1.lineBreaker)
    buffer.push(`**${label1}**`)
    buffer.push(node1.content.replace(node1.title, ''))
    buffer.push(`**${label2}**`)
    buffer.push(node2.content.replace(node2.title, ''))
  } else {
    buffer.push(node1.content)
  }

  for (var i = 0; i < node1.children.length; i++) {
    if (node2 && node2.children[i]) {
      mergeNode(buffer, node1.children[i], label1, node2.children[i], label2)
    } else {
      mergeNode(buffer, node1.children[i], label1, null, label2)
    }
  }
}

const findAllTagsFromCases = function(content) {
  const lines = content.split(/\r?\n/)
  const tags = []
  for (var i in lines) {
    const startTagName = parseBlockStartTagWithArg(lines[i], 'body')
      if (startTagName) {
        tags.push(startTagName)
      }
  }

  return tags
}

// 将新文档的增量添加到主文档中
const mergeDiffToContent = function(content, newMethodsContents) {
  const regex = RegExp(`\\s*${commentDelimiter[0]}\\s*\\.cssg-methods-pragma\\s*${commentDelimiter[1]}`, 'g')
  let array1
  const contentArr = []
  let i = 0
  let nextIndex = 0
  while ((array1 = regex.exec(content)) !== null) {
    contentArr.push(content.substring(nextIndex, regex.lastIndex - array1[0].length))
    contentArr.push('\n\n')
    contentArr.push(newMethodsContents[i])
    contentArr.push(array1[0].replace('\n', ''))
    nextIndex = regex.lastIndex
    i++
  }
  if(nextIndex > 0 && nextIndex < content.length - 1) {
    contentArr.push(content.substring(nextIndex))
  }
  return contentArr.length > 0 ? contentArr.join(''): null
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
  injectCodeSnippet2DocOld,
  injectCodeSnippet2Doc,
  // 合并文档
  mergeDocsForMultiLanguage,
  // 代码块
  Snippet,
  // 设置注释符号
  setCommentDelimiter,
  // 获取代码块注释开始标签
  getSnippetBodyCommentStart,
  // 获取代码块注释结束标签
  getSnippetBodyCommentEnd,
  // 找到代码中所有的标签
  findAllTagsFromCases,
  // 将新文档的增量添加到主文档中
  mergeDiffToContent
}