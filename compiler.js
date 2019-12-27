const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const git = require('./comm/git')

// 记录模版对应的代码缩进值
const templateIndentation = {}

const build = async function (projRoot, docSetSpecifiedRoot) {
  console.log('CSSG build start:\n----------------- ')

  // load global config
  var globalConfigFile = path.join(projRoot, 'g.json')
  var testAll
  var docSetRoot

  if (!fs.existsSync(globalConfigFile)) {
    globalConfigFile = path.join(projRoot, '../g.json')
    testAll = false
    docSetRoot = path.join(projRoot, '../docRepo')
  } else {
    testAll = true
    docSetRoot = path.join(projRoot, 'docRepo')
  }

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  // sync documents
  if (docSetSpecifiedRoot == null) {
    await git.syncRemoteRepo(global.docSetRemoteGitUrl, docSetRoot)
  } else {
    docSetRoot = docSetSpecifiedRoot
  }

  const sdkDocSetRoot = path.join(docSetRoot, global.sdkDocSetRelativePath)

  const projs = []
  if (testAll) {
    var list = fs.readdirSync(projRoot)
    list.forEach(function(file) {
        file = path.resolve(projRoot, file)
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
          projs.push(file)
        }
    })
  } else {
    projs.push(projRoot)
  }

  // do test
  for (var i in projs) {
    await buildOne(projs[i], sdkDocSetRoot, global)
  }

  console.log('CSSG build end:\n----------------- ')

}

const buildOne = async function (projRoot, sdkDocSetRoot, global) {
  // load project config
  var configFile = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(configFile)) {
    console.log(`Cann't find cssg.json in ${projRoot}`)
    return null
  }

  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  
  // document file relative path
  const docRoot = config.docRoot
  if (!config.docRoot) {
    console.warn(`Please set \"docRoot\" in ${configFile}.`)
    return null
  }
  // document set directory
  const targetDocSetDir = path.join(sdkDocSetRoot, docRoot)

  // test case destination dir
  const testCaseRoot = path.join(projRoot, config.compileDist || global.compileDist)
  // source file extension
  const extension = config.sourceExtension
  
  // macro defines
  config.macro4doc = config.macro4doc || {}
  config.macro4test = config.macro4test || {}
  config.macro4doc.language = config.language
  config.macro4test.language = config.language
  const macro4doc = util.applyBaseConfig(config.macro4doc, global.macro4doc)
  const macro4test = util.applyBaseConfig(config.macro4test, global.macro4test)

  // template defines
  var testcaseTpl = path.join(projRoot, config.testcaseTemplate)
  testcaseTpl = util.loadFileContent(testcaseTpl)
  mustache.parse(testcaseTpl)
  
  // comment delimiter
  const delimiter = config.commentDelimiter || global.commentDelimiter
  parser.setCommentDelimiter(delimiter)

  // 哪些代码不需要检查测试结果
  const testResultFree = config.testResultFree || global.testResultFree

  // 元数据
  const testMetadata = config.testMetadata || {}

  // create destination dir if necessary
  if (fs.existsSync(testCaseRoot)) {
    fs.removeSync(testCaseRoot)
  }
  fs.mkdirSync(testCaseRoot, { recursive: true })

  // lookup Documents
  const documents = util.traverseFiles(targetDocSetDir, global.docExtension)
  // 代码块名称通用前缀
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix
  // 服务定义块的名字
  const initBlockName = config.initSnippetName || global.initSnippetName
  // 哪些case无法通过测试
  const skipCases = config.skipCases || []

  // 抽取代码段
  const snippets = []
  var initSnippet = {}
  for (var i in documents) {
    const subSnippets = await parser.getSnippetsFromDoc(documents[i])
    const matchedSnippets = []
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      if (snippetNameCommonPrefix && !snippet.name.startsWith(snippetNameCommonPrefix)) {
        // 不符合前缀限制
        continue
      } else if (snippetNameCommonPrefix) {
        // 去掉前缀
        snippet.name = snippet.name.replace(snippetNameCommonPrefix, "")
      }

      //  代码段处理
      processSnippetBody(snippet, macro4doc, macro4test, config.beforeRun, testResultFree)

      // 初始化
      if (snippet.name == initBlockName) {
        initSnippet = snippet
      } else {
        matchedSnippets.push(snippet)
      }
    }
    Array.prototype.push.apply(snippets, matchedSnippets)
  }

  // 生成映射表
  const snippetNameDic = {}
  for (var i in snippets) {
    const snippet = snippets[i]
    if (snippet.name) {
      snippetNameDic[snippet.name] = snippet
    }
  }

  // 生成测试组
  const groups = {}
  config.testGroup = config.testGroup || {}
  for (var groupName in global.testGroup) {
    var subGroups = global.testGroup[groupName]
    if (config.testGroup[groupName]) {
      subGroups = Object.assign(subGroups, config.testGroup[groupName])
      delete config.testGroup[groupName]
    }
    groups[groupName] = subGroups
  }
  Object.assign(groups, config.testGroup)
  const usedSnppets = []
  for (var groupName in groups) {
    var subGroups = groups[groupName]
    for (var caseName in subGroups) {
      if (Array.isArray(subGroups[caseName])) {
        Array.prototype.push.apply(usedSnppets, subGroups[caseName])
      }
    }
  }
  for (var name in snippetNameDic) {
    if (!usedSnppets.includes(name)) {
      groups[name] = {}
      groups[name][name] = [name]
    }
  }

  // 生成单元测试文件
  for (var groupName in groups) {
    if (groups.hasOwnProperty(groupName)) {
      const group = groups[groupName]
      const pipeline = {
        name: groupName,
        initSnippet: initSnippet.bodyBlock
      }

      for (var caseName in group) {
        const testcase = group[caseName]

        if (Array.isArray(testcase)) {
          // 方法列表
          const gs = []
          var hasMethodList = false
          for (var i in testcase) {
            if (snippetNameDic.hasOwnProperty(testcase[i])) {
              hasMethodList = true
              gs.push(snippetNameDic[testcase[i]])
            }
          }
          if (hasMethodList) {
            pipeline[caseName] = gs
          }
        } else {
          pipeline[caseName] = testcase
        }
      }

      genTestCase(pipeline, {
        testMetadata,
        skipCases,
        testcaseTpl,
        extension, 
        testCaseRoot,
        initSnippetNoIdentation: config.initSnippetNoIdentation,
        sourceNameUseUnderscore: config.sourceNameUseUnderscore,
        methodNameBeginWithUpperCase: config.methodNameBeginWithUpperCase
      })
    }
  }

}

const processSnippetBody = function (snippet, macro4doc, macro4test, beforeRun, testResultFreeCases) {
  var body = snippet.bodyBlock

  const lines = util.splitLines(body)
  for(var i = lines.length - 1; i>=0; i--) {
    if (lines[i].trim().length < 1) {
      lines.pop()
    } else {
      break
    }
  }
  const lineBuffer = []

  // 插入注释开始
  lineBuffer.push(parser.getSnippetBodyCommentStart(snippet.name))

  const tailInsertExps = []
  for (const i in lines) {
    var lineCode = lines[i]
    // 替换变量值
    for (const key in macro4doc) {
      if (macro4test[key]) {
        lineCode = lineCode.replace(new RegExp(macro4doc[key], 'g'), macro4test[key])
      }
    }

    const belowExps = []
    // 其他加工
    if (beforeRun) {
      const insertExps = beforeRun.insert
      if (insertExps) {
        for (var j in insertExps) {
          const insertExp = insertExps[j]
          if (insertExp.type == 'assert' && testResultFreeCases.includes(snippet.name)) {
            // 忽略结果的 case
            continue
          }
          if (insertExp.excludes && insertExp.excludes.includes(snippet.name)) {
            continue
          }
          if (lineCode.trim() == insertExp.anchor || 
              (insertExp.isRegex && lineCode.match(insertExp.anchor))) {
            // 保持缩进
            var indentation = 0
            const matcher = lineCode.match("(\\s*).+\\s*")
            if (matcher) {
              indentation = matcher[1].length
            }
            if (insertExp.indentation > 0) {
              indentation += insertExp.indentation
            }
            const indentationString = pretty.getIndentationString(indentation)
            if (insertExp.align == 'below') {
              belowExps.push(indentationString + insertExp.expression)
            } else if (insertExp.align == 'above') {
              lineBuffer.push(indentationString + insertExp.expression)
            }
          } else if (insertExp.align == 'tail') {
            tailInsertExps[j] = insertExp.expression
          }
        }
      }
    }

    lineBuffer.push(lineCode)
    Array.prototype.push.apply(lineBuffer, belowExps)
  }

  // 插入最尾的语句
  if (tailInsertExps.length > 0) {
    for (var i = 0; i < tailInsertExps.length; i++) {
      if (tailInsertExps[i]) {
        lineBuffer.push(tailInsertExps[i])
      }
    }
  }

  // 插入注释结束
  lineBuffer.push(parser.getSnippetBodyCommentEnd())

  body = lineBuffer.join(util.LINE_BREAKER)

  snippet.bodyBlock = body
}

const genTestCase = function (pipeline, option) {
  const camelCaseName = getCamelCaseName(pipeline.name)
  const caseName = pipeline.name
  delete pipeline.name

  // figure out code block indentation
  var indentation = templateIndentation[option.testcaseTpl]
  if (!indentation) {
    indentation = getSnippetIndentation(option.testcaseTpl)
    templateIndentation[option.testcaseTpl] = indentation
  }

  const methodsName = []
  if (pipeline.initSnippet && !option.initSnippetNoIdentation) {
    pipeline.initSnippet = pretty.prettyCodeBlock(pipeline.initSnippet, indentation)
  }
  const hash = {
    name: camelCaseName,
    methods: [],
    setup: [],
    teardown: [],
    cases: []
  }
  for (let key in pipeline) {
    if (pipeline.hasOwnProperty(key)) {
      const testcase = pipeline[key]
      if (Array.isArray(testcase)) {
        const caseSteps = []
        for (let i in testcase) {
          const snippet = testcase[i]
          const name = snippet.name
          const o = Object.assign({
            name: getCamelCaseNameWithLowStart(name)
          }, findMetadataForTestCase(option.testMetadata, name))
          if (!methodsName.includes(name)) {
            o.snippet = pretty.prettyCodeBlock(snippet.bodyBlock, indentation)
            hash.methods.push(o)
            methodsName.push(name)
          }
          if (!option.skipCases.includes(name)) {
            if (key == 'setup') {
              hash.setup.push(o)
            } else if (key == 'teardown') {
              hash.teardown.push(o)
            } else {
              caseSteps.push(o)
            }
          }
        }
        if (caseSteps.length > 0) {
          hash.cases.push({
            name: (option.methodNameBeginWithUpperCase ? "Test" : "test") + getCamelCaseName(key),
            steps: caseSteps
          })
        }
      } else {
        hash[key] = testcase
      }
    }
  }

  const testCaseContent = mustache.render(option.testcaseTpl, hash)

  const fileName = option.sourceNameUseUnderscore ? getUnderscoreCaseName(caseName) + "_test" : 
    camelCaseName + "Test"
  const testCaseFile = path.join(option.testCaseRoot, fileName + option.extension)
  util.saveFile(testCaseFile, testCaseContent)
  
  console.log('generate test case :', testCaseFile)
}

function findMetadataForTestCase(testMetadata, snippetName) {
  const metadata = {}
  for (var meta in testMetadata) {
    if (testMetadata.hasOwnProperty(meta)) {
      const caseList = testMetadata[meta]
      if (caseList.includes(snippetName)) {
        metadata[meta] = true
      }
    }
  }
  return metadata
}

function getSnippetIndentation(testcaseTpl) {
  const lines = util.splitLines(testcaseTpl)
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

const getUnderscoreCaseName = function (name) {
  var newName = name
  while (newName.indexOf('-') != -1) {
    newName = newName.replace('-', '_');
  }
  return newName
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

const getCamelCaseNameWithLowStart = function (name) {
  const array = name.split('-')
  var camelCaseName = ''
  for (var i in array) {
    if (i == 0) {
      camelCaseName = camelCaseName.concat(array[i].charAt(0).toLowerCase()
       + array[i].substring(1))
    } else {
      camelCaseName = camelCaseName.concat(array[i].charAt(0).toUpperCase()
      + array[i].substring(1))
    }
  }
  return camelCaseName
}

module.exports = {
  build
}

// build(path.join(__dirname, '../cssg-cases/Java'), 
// '/Users/wjielai/Workspace/cssg-cases/docRepo')