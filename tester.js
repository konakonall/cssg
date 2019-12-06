const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const git = require('./comm/git')

// 记录模版对应的代码缩进值
const templateIndentation = {}

const test = async function (projRoot) {
  console.log('CSSG compile start:\r\n----------------- ')

  // load global config
  var globalConfigFile = path.join(projRoot, 'g.json')
  var testAll
  var localRepoDir

  if (!fs.existsSync(globalConfigFile)) {
    globalConfigFile = path.join(projRoot, '../g.json')
    testAll = false
    localRepoDir = path.join(projRoot, '../docRepo')
  } else {
    testAll = true
    localRepoDir = path.join(projRoot, 'docRepo')
  }

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  // sync documents
  // await git.syncRemoteRepo(global.docsRemoteRepo, localRepoDir)
  const docsDir = path.join(localRepoDir, global.docRelativePath)

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
    await testOne(projs[i], docsDir, global)
  }

}

const testOne = async function (projRoot, docsDir, global) {
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
  const targetDocsSetDir = path.join(docsDir, docRoot)

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
  const exclusiveTemplate = config.exclusiveTemplate || {}
  testcaseTpl = util.loadFileContent(testcaseTpl)
  mustache.parse(testcaseTpl)

  // 表示什么分类的操作可以抽象出方法
  const methodsCategory = config.methodsCategory || global.methodsCategory

  // create destination dir if necessary
  if (fs.existsSync(testCaseRoot)) {
    fs.removeSync(testCaseRoot)
  }
  fs.mkdirSync(testCaseRoot, { recursive: true })

  // lookup Documents
  const documents = util.traverseFiles(targetDocsSetDir, global.docExtension)
  // 代码块名称通用前缀
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix
  // 服务定义块的名字
  const initBlockName = config.initSnippetName || global.initSnippetName

  // 抽取代码段
  const snippets = []
  var initSnippet
  for (var i in documents) {
    const subSnippets = await parser.parseDOC2Prototype(documents[i])
    var initBlockIndex = -1
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
      processSnippetBody(snippet, macro4doc, macro4test, config.beforeRun)

      // 初始化
      if (snippet.name == initBlockName) {
        initSnippet = snippet
        initBlockIndex = j
      }
    }
    if (initBlockIndex >= 0) {
      subSnippets.splice(initBlockIndex, 1)
    } 
    Array.prototype.push.apply(snippets, subSnippets)
  }

  // 生成映射表
  const snippetNameDic = {}
  for (var i in snippets) {
    const snippet = snippets[i]
    if (snippet.name) {
      snippetNameDic[snippet.name] = snippet
    }
  }

  // generate test case by group
  const groups = Object.assign({}, global.testGroup, config.testGroup || {})
  const added = []
  for (var groupName in groups) {
    if (groups.hasOwnProperty(groupName)) {
      const group = groups[groupName]
      const pipeline = {}

      pipeline.name = groupName
      pipeline.initSnippet = initSnippet.bodyBlock
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

  // generate remainning test case
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
        "name": snippet.name,
        "initSnippet": initSnippet.bodyBlock
      }
      genTestCase(pipeline, {
        methodsCategory,
        "testcaseTpl": tpl,
        extension, 
        testCaseRoot
      })
    }
  }

}

const processSnippetBody = function (snippet, macro4doc, macro4test, beforeRun) {
  var body = snippet.bodyBlock

  const insertExps = beforeRun.insert
  if (insertExps) {
    const lines = body.split(/(?:\r\n|\r|\n)/g)
    const lineBuffer = []

    for (const i in lines) {
      var lineCode = lines[i]
      // 替换变量值
      for (const key in macro4doc) {
        if (macro4test[key]) {
          lineCode = lineCode.replace(macro4doc[key], macro4test[key])
        }
      }

      // 其他加工
      const belowExps = []
      for (var j in insertExps) {
        const insertExp = insertExps[j]
        if (lineCode == insertExp.target) {
          if (insertExp.anchor == 'below') {
            belowExps.push(insertExp.expression)
          } else if (insertExp.anchor == 'above') {
            lineBuffer.push(insertExp.expression)
          }
        }
      }
      lineBuffer.push(lineCode)
      Array.prototype.push.apply(lineBuffer, belowExps)
    }

    body = lineBuffer.join(util.LINE_BREAKER)
  }

  snippet.bodyBlock = body
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
  pipeline.initSnippet = pretty.prettyCodeBlock(pipeline.initSnippet, indentation)
  const hash = {
    "name": camelCaseName,
    "isDemo": false,
    "methods": [] 
  }
  for (let segName in pipeline) {
    if (pipeline.hasOwnProperty(segName)) {
      const segs = pipeline[segName]
      hash[segName] = []
      if (Array.isArray(segs)) {
        for (let i in segs) {
          const snippet = segs[i]
          const snippetContent = pretty.prettyCodeBlock(snippet.bodyBlock, indentation)
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

const getCamelCaseName = function (name) {
  const array = name.split('-')
  var camelCaseName = ''
  for (var i in array) {
    camelCaseName = camelCaseName.concat(array[i].charAt(0).toUpperCase()
       + array[i].substring(1))
  }
  return camelCaseName
}

module.exports = {
  test
}

test('../cssg-cases/Android')