const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

// 记录模版对应的代码缩进值
const templateIndentation = {}

/**
 * 使用文档里的代码片段生成示例代码文件 
 * @param {*} docSetRoot  
 * @param {*} destination  
 */
const build = async function (docSetRoot, destination, lang) {
  console.log('CSSG Compiler start:\n----------------- ')

  // 全局配置文件
  var globalConfigFile = 'g.json'

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Error: Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  const pl = global.langs[lang];
  if (!pl) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }
  const config = util.applyBaseConfig(pl, global)
  console.log('CSSG Compiler load config :', config)

  await buildOne(docSetRoot, config, destination)

  console.log('CSSG Compiler end:\n----------------- ')

}

const buildOne = async function (sdkDocSetRoot, config, destination) {
  // create destination dir if necessary
  if (fs.existsSync(destination)) {
    fs.removeSync(destination)
  }
  fs.mkdirSync(destination, { recursive: true })

  // lookup Documents
  const documents = util.traverseFiles(sdkDocSetRoot, global.docExtension)

  // source file extension
  const extension = config.sourceExtension

  // 抽取代码段
  const snippets = []
  var initSnippet = {}
  for (var i in documents) {
    const subSnippets = await parser.getSnippetsFromDoc(documents[i])
    const matchedSnippets = []
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      matchedSnippets.push(snippet)
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

  // 生成示例单元
  const groups = {}
  for (var groupName in global.groups) {
    groups[groupName] = global.groups[groupName]
  }

  // 生成示例文件
  for (var groupName in groups) {
    const group = groups[groupName]
    const pipeline = {
      name: groupName
    }
    if (Array.isArray(group)) {
      // 方法列表
      const gs = []
      for (var i in group) {
        if (snippetNameDic.hasOwnProperty(group[i])) {
          gs.push(snippetNameDic[group[i]])
        }
      }
      pipeline[caseName] = gs
    } else {
      pipeline[caseName] = snippetNameDic[group]
    }

    genExample(pipeline, {
      testMetadata,
      skipCases,
      testcaseTpl,
      extension, 
      testCaseRoot,
      projRoot,
      initSnippetNoIdentation: config.initSnippetNoIdentation,
      sourceNameUseUnderscore: config.sourceNameUseUnderscore,
      methodNameBeginWithUpperCase: config.methodNameBeginWithUpperCase
    })
  }

}

const genExample = function (pipeline, option) {
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

  pipeline.distConfig = pipeline.distConfig || {}
  const fileName = pipeline.distConfig.name || (option.sourceNameUseUnderscore ? 
    getUnderscoreCaseName(caseName) + "_test" : camelCaseName + "Test")
  var distRoot;
  if (pipeline.distConfig.root) {
    distRoot = path.join(option.projRoot, pipeline.distConfig.root)
  } else {
    distRoot = option.testCaseRoot
  }
  const testCaseFile = path.join(distRoot, fileName + option.extension)
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