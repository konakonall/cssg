var fs = require('fs');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

// 记录模版对应的代码缩进值
const templateIndentation = {}

const genSnippet = function (snippet, option) {
  let snippetContent = renderSnippetContent(
    snippet, 
    option.macro, 
    option.dynamicDefine,
    0)

  // 对于测试case才替换表达式
  if (option.caseForTesting.includes(snippet.name)) {
    // remote ignore expression in code block
    for (const i in option.ignoreExpression4Snippet) {
      const exp = option.ignoreExpression4Snippet[i]
      snippetContent = snippetContent.replace(new RegExp("\\s*" + exp, 'g'), "")
    }
  }

  const snippetDoc = util.getSnippetFile(option.snippetsRoot, 
    option.snippetNameCommonPrefix + snippet.name)
  util.saveFile(snippetDoc, snippetContent)

  console.log('generate snippet :', snippetDoc)

  return snippetContent
}

const genSnippetEverything = function(snippetContents, option) {
  // figure out code block indentation
  var indentation = templateIndentation[option.testcaseTpl]
  if (!indentation) {
    indentation = getSnippetIndentation(option.testcaseTpl)
    templateIndentation[option.testcaseTpl] = indentation
  }

  const methods = []
  for (const name in snippetContents) {
    if (snippetContents.hasOwnProperty(name)) {
      const content = snippetContents[name]
      //只有测试case才加入文件
      if (option.caseForTesting.includes(name)) {
        methods.push({
          name: getCamelCaseName(name),
          snippet: pretty.prettyCodeBlock(content, indentation)
        })
      }
    }
  }
  const name = "SnippetEverything"
  const assemblyContent = mustache.render(option.testcaseTpl, {
    "name": name,
    "methods": methods,
    "isDemo": true
  })

  const testCaseFile = path.join(option.testCaseRoot, name + option.extension)
  util.saveFile(testCaseFile, assemblyContent)
  
  console.log('generate snippet Everything :', testCaseFile)
}

const genTestCase = function (pipeline, option) {
  const camelCaseName = getCamelCaseName(pipeline.name)
  delete pipeline.name

  // figure out code block indentation
  var indentation = templateIndentation[option.testcaseTpl]
  if (!indentation) {
    indentation = getSnippetIndentation(option.testcaseTpl)
    templateIndentation[option.testcaseTpl] = indentation
  }

  const methodsName = []
  const hash = Object.assign({
    "name": camelCaseName,
    "isDemo": false,
    "methods": []
  }, option.macro)
  for (let segName in pipeline) {
    if (pipeline.hasOwnProperty(segName)) {
      const segs = pipeline[segName]
      hash[segName] = []
      if (Array.isArray(segs)) {
        for (let i in segs) {
          const snippet = segs[i]
          const snippetContent = renderSnippetContent(snippet, option.macro, 
            option.dynamicDefine[snippet.name], indentation)
          const name = snippet.name
          const o = {
            name: getCamelCaseName(name),
            snippet: snippetContent
          }
          if (!methodsName.includes(name) && option.methodsCategory.includes(segName)) {
            hash.methods.push(o)
            methodsName.push(name)
          }
          hash[segName].push(o)
        }
      } else {
        hash[segName] = segs
      }
    }
  }
  hash.hasSteps = hash.steps && hash.steps.length > 0

  const testCaseContent = mustache.render(option.testcaseTpl, hash)

  const testCaseFile = path.join(option.testCaseRoot, camelCaseName + option.extension)
  util.saveFile(testCaseFile, testCaseContent)
  
  console.log('generate test case :', testCaseFile)
}

function getSnippetIndentation(testcaseTpl) {
  const lines = testcaseTpl.split(/(?:\r\n|\r|\n)/g)
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

function renderSnippetContent(snippet, macro, dynamicDefine, indentation) {
  const value = Object.assign({}, macro, dynamicDefine || {})
  const snippetBody = mustache.render(snippet.bodyBlock, value)
  return pretty.prettyCodeBlock(snippetBody, indentation)
}

const getCamelCaseName = function (name) {
  const array = name.split('-')
  var camelCaseName = ''
  for (var i in array) {
    camelCaseName = camelCaseName.concat(array[i].charAt(0).toUpperCase()
       + array[i].substring(1))
  }
  return camelCaseName
}

const isInitMethod = function (snippet, prefix) {
  return snippet.name.startsWith(prefix)
}

const getCastForTest = function (testGroup) {
  const caseNames = []
  for (var groupName in testGroup) {
    if (testGroup.hasOwnProperty(groupName)) {
      const group = testGroup[groupName]

      for (var segName in group) {
        if (group.hasOwnProperty(segName)) {
          const segs = group[segName]
          for (var i in segs) {
            if (!caseNames.includes(segs[i])) {
              caseNames.push(segs[i])
            }
          }
        }
      }
    }
  }
  return caseNames
}

const compile = async function(projRoot) {
  console.log('CSSG compile start:\r\n----------------- ')
  // load project config
  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  // load global config
  const global = util.loadEntryConfig(path.join(projRoot, '..'), 'g.json')

  // snippets file destination dir
  const snippetsRoot = util.getSnippetsRoot(projRoot)
  // test case destination dir
  const testCaseRoot = path.join(projRoot, config.compileDist || global.compileDist)

  // source file extension
  const extension = config.sourceExtension
  // Assembly source file root
  const sourcesRoot = path.join(projRoot, config.sourcesRoot)
  // comment delimiter
  const delimiter = config.commentDelimiter || ["\\/\\/", ""]
  parser.setCommentDelimiter(delimiter)

  // macro defines
  config.macro4doc.language = config.language
  config.macro4test.language = config.language
  const macro4doc = util.applyBaseConfig(config.macro4doc, global.macro4doc)
  const macro4test = util.applyBaseConfig(config.macro4test, global.macro4test)
  const dynamicDefine = config.dynamic || {}

  // template defines
  var testcaseTpl = path.join(projRoot, config.testcaseTemplate)
  const exclusiveTemplate = config.exclusiveTemplate || {}
  testcaseTpl = util.loadFileContent(testcaseTpl)
  mustache.parse(testcaseTpl)

  // load ignore expression
  const ignoreExpression4Snippet = config.ignoreExpressionInDoc || []
  // 表示什么分类的操作可以抽象出方法
  const methodsCategory = config.methodsCategory || global.methodsCategory

  // create destination dir if necessary
  if (!fs.existsSync(snippetsRoot)) {
    fs.mkdirSync(snippetsRoot, { recursive: true })
  }
  if (!fs.existsSync(testCaseRoot)) {
    fs.mkdirSync(testCaseRoot, { recursive: true })
  }
  // 记录当前有哪些代码段是真正跑测试流程的
  const caseForTesting = getCastForTest(global.testGroup)

  // lookup Assembly file
  const sources = util.traverseFiles(sourcesRoot, extension)
  // lookup all snippets
  const globalHeaderName = global.globalHeaderName
  const globalInitNamePrefix = config.globalInitNamePrefix || global.globalInitNamePrefix
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix || ''
  const snippets = []
  var globalHeaderBlock // 头部 service/client 定义
  for (var i in sources) {
    const subSnippets = await parser.parseSnippetBody(sources[i])
    var headerIndex = -1
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      if (snippetNameCommonPrefix.length > 0) {
        // 去掉前缀
        snippet.name = snippet.name.replace(snippetNameCommonPrefix, "")
      }
      if (globalHeaderBlock == null) {
        if (snippet.name == globalHeaderName) {
          headerIndex = j
          // 把头部定义加到代码块中
          globalHeaderBlock = snippet.bodyBlock
          // 加到之前的代码块中
          for (var k in snippets) {
            if (!isInitMethod(snippet, globalInitNamePrefix)) {
              snippets[k].bodyBlock = globalHeaderBlock 
                + util.LINE_BREAKER 
                + util.LINE_BREAKER 
                + snippets[k].bodyBlock
            }
          }
        }
      } else if (globalHeaderBlock) {
        if (!isInitMethod(snippet, globalInitNamePrefix)) {
          snippet.bodyBlock = globalHeaderBlock 
          + util.LINE_BREAKER 
          + util.LINE_BREAKER 
          + snippet.bodyBlock
        }
      }
    }
    if (headerIndex >= 0) {
      subSnippets.splice(headerIndex, 1)
    } 
    Array.prototype.push.apply(snippets, subSnippets)
  }

  // generate snippet file
  const snippetNameDic = {}
  const snippetContents = {}
  for (var i in snippets) {
    const snippet = snippets[i]
    if (snippet.name) {
      const content = genSnippet(snippet, {
        "macro": macro4doc,
        "dynamicDefine": dynamicDefine[snippet.name],
        caseForTesting,
        ignoreExpression4Snippet,
        snippetsRoot,
        snippetNameCommonPrefix
      })
      
      snippetContents[snippet.name] = content
      snippetNameDic[snippet.name] = snippet
    }
  }

  // generate snippet assembly case
  genSnippetEverything(snippetContents, {
    testcaseTpl,
    caseForTesting,
    extension,
    testCaseRoot
  })

  // generate test case by group
  const groups = Object.assign({}, global.testGroup, config.testGroup || {})
  const added = []
  for (var groupName in groups) {
    if (groups.hasOwnProperty(groupName)) {
      const group = groups[groupName]
      const pipeline = {}

      pipeline.name = groupName
      var hasMethodList = false
      for (var segName in group) {
        if (group.hasOwnProperty(segName)) {
          const segs = group[segName]
          if (Array.isArray(segs)) {
            // 方法列表
            const gs = []
            for (var i in segs) {
              if (snippetNameDic.hasOwnProperty(segs[i])) {
                hasMethodList = true
                gs.push(snippetNameDic[segs[i]])
                added.push([segs[i]])
              }
            }
            pipeline[segName] = gs
          } else {
            pipeline[segName] = segs
          }
        }
      }

      if (hasMethodList) {
        var tpl = testcaseTpl
        if (exclusiveTemplate[groupName]) {
          tpl = path.join(projRoot, exclusiveTemplate[groupName])
          tpl = util.loadFileContent(tpl)
        }
  
        genTestCase(pipeline, {
          methodsCategory,
          "macro": macro4test, 
          dynamicDefine, 
          "testcaseTpl": tpl,
          extension, 
          testCaseRoot
        })
      }
    }
  }
  for (var i in added) {
    delete snippetNameDic[added[i]]
  }

  // generate remain test case
  for (var name in snippetNameDic) {
    if (snippetNameDic.hasOwnProperty(name)) {
      const snippet = snippetNameDic[name]

      var tpl = testcaseTpl
      if (exclusiveTemplate[snippet.name]) {
        tpl = path.join(projRoot, exclusiveTemplate[snippet.name])
        tpl = util.loadFileContent(tpl)
      }
      const pipeline = {
        "steps": [snippet],
        "name": snippet.name 
      }
      genTestCase(pipeline, {
        methodsCategory,
        "macro": macro4test, 
        dynamicDefine, 
        "testcaseTpl": tpl,
        extension, 
        testCaseRoot
      })
    }
  }

  console.log('----------------- \r\nCSSG compile end.')

}

module.exports = {
  compile
}

// compile('../cssg-cases/iOS')